import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MayaService } from '../mayaService';
import { getWorkspacePort, setWorkspacePort, clearWorkspacePort } from '../config';
import { sendToMaya } from '../mayaConnection';
import { MayaInstance } from '../types';

// Register the Maya panel as a sidebar view
export function registerMayaPanel(context: vscode.ExtensionContext) {
    const provider = new MayaViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('mayaLink.panel', provider)
    );
    context.subscriptions.push(provider.statusBarItem);
    return provider;
}

// Provider class that tells VS Code how to render the sidebar view
class MayaViewProvider implements vscode.WebviewViewProvider {
    private mayaService: MayaService;
    private webviewView: vscode.WebviewView | undefined;
    readonly statusBarItem: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext) {
        // Restore the persisted connection so a window reload does not reset
        // every card to disconnected while sendCode still targets that port
        this.mayaService = new MayaService(getWorkspacePort(context));
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            0
        );
        // Clicking the status bar item opens the command palette
        this.statusBarItem.command = {
            title: 'Maya Link commands',
            command: 'workbench.action.quickOpen',
            arguments: ['>mayaLink'],
        };
    }

    // Called by VS Code when the user opens the sidebar view
    resolveWebviewView(webviewView: vscode.WebviewView) {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                // Read from dist/, not src/. .vscodeignore excludes src/ from
                // the packaged extension, so these files only exist in dist
                // when installed.
                vscode.Uri.file(path.join(this.context.extensionUri.fsPath, 'dist', 'webview'))
            ]
        };

        webviewView.webview.html = this.getWebviewContent(webviewView);

        this.registerMessages(webviewView);
        this.registerVisibility(webviewView);
    }

    // Public method called by the refresh command
    refresh() {
        if (this.webviewView) {
            this.webviewView.webview.postMessage({ type: 'refresh' });
        }
    }

    // Push the current instance list to the webview and status bar
    private render(webviewView: vscode.WebviewView, instances: MayaInstance[]) {
        webviewView.webview.postMessage({ type: 'instances', data: instances });
        this.updateStatusBar(instances);
    }

    // Show the connected instance in the status bar, or hide when none
    private updateStatusBar(instances: MayaInstance[]) {
        const connected = instances.find((i) => i.status === 'connected');

        if (!connected) {
            this.statusBarItem.hide();
            return;
        }

        this.statusBarItem.text = [
            `Maya link: port:${connected.port}`,
            `- ${connected.version ?? 'Maya'}`,
            `· ${connected.sceneName ?? 'untitled'}`,
        ].join(' ');

        this.statusBarItem.tooltip =
            'Maya Link — click to open the command palette';
        this.statusBarItem.show();
    }

    private registerMessages(webviewView: vscode.WebviewView) {
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'refresh': {
                    const instances = await this.mayaService.refresh();
                    this.render(webviewView, instances);
                    break;
                }

                case 'connect': {
                    const instances = this.mayaService.connect(message.port);
                    setWorkspacePort(this.context, message.port);
                    await this.notifyMaya(message.port, 'connect');
                    vscode.window.showInformationMessage(`Connected to Maya on port ${message.port}`);
                    this.render(webviewView, instances);
                    break;
                }

                case 'disconnect': {
                    const instances = this.mayaService.disconnect(message.port);
                    if (!instances.some((i) => i.status === 'connected')) {
                        clearWorkspacePort(this.context);
                    }
                    this.render(webviewView, instances);
                    break;
                }

                case 'ping': {
                    await this.notifyMaya(message.port, 'ping');
                    break;
                }
            }
        });
    }

    // Scan again each time the panel becomes visible
    private registerVisibility(webviewView: vscode.WebviewView) {
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.refresh();
            }
        });
    }

    // Tell Maya we are here. No exec() wrapper needed: sendToMaya prepends the
    // anti-echo import, so the payload is already multi-line and the Script
    // Editor will not run the print twice.
    private async notifyMaya(port: number, action: 'connect' | 'ping') {
        try {
            await sendToMaya(port, `print("mayaLink.${action} -> Port: ${port}")`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to ${action} Maya on port ${port}`);
        }
    }

    // Read the HTML file and replace placeholders with webview URIs
    private getWebviewContent(webviewView: vscode.WebviewView): string {
        const webviewPath = path.join(this.context.extensionUri.fsPath, 'dist', 'webview');

        const stylesUri = webviewView.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'styles.css'))
        );
        const appUri = webviewView.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'app.js'))
        );

        const htmlPath = path.join(webviewPath, 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf-8');

        html = html.replace('{{ stylesUri }}', stylesUri.toString());
        html = html.replace('{{ appUri }}', appUri.toString());

        return html;
    }
}