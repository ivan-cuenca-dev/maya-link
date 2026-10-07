import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MayaService } from '../mayaService';
import { getWorkspacePort, setWorkspacePort, clearWorkspacePort } from '../config';
import { sendToMaya } from '../mayaConnection';
import { MayaInstance } from '../types';
import { enableLog, disableLog, removeLog, terminalSpec } from '../mayaConsole';
import { checkPort } from '../portScanner';
import { trace } from '../output';

// How often to check that a console's Maya is still there, and how many
// failures before saying so. Three misses avoids warning on a single hiccup.
const MAYBE_GONE_MS = 5000;
const MISSES_BEFORE_WARNING = 3;

// Register the Maya panel as a sidebar view
export function registerMayaPanel(context: vscode.ExtensionContext) {
    const provider = new MayaViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('mayaLink.panel', provider)
    );
    context.subscriptions.push(provider.statusBarItem);
    return provider;
}

class MayaViewProvider implements vscode.WebviewViewProvider {
    private mayaService: MayaService;
    private webviewView: vscode.WebviewView | undefined;
    readonly statusBarItem: vscode.StatusBarItem;

    // One console terminal per Maya instance, keyed by port
    private consoles = new Map<number, vscode.Terminal>();
    // Liveness poll per open console, and whether it has already warned
    private watches = new Map<number, NodeJS.Timeout>();
    private warned = new Set<number>();

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
            title: 'Maya link commands',
            command: 'workbench.action.quickOpen',
            arguments: ['>mayaLink'],
        };
        // Consoles outlive a window reload, so close them on the way out
        this.context.subscriptions.push({ dispose: () => this.closeAllConsoles() });
        // Terminal has no onDidClose; the event is on the window. Used to
        // forget a console the user closed, so its icon reopens instead of
        // showing a terminal that no longer exists
        this.context.subscriptions.push(
            vscode.window.onDidCloseTerminal((closed) => {
                const port = this.portForTerminal(closed);
                if (port !== undefined) {
                    this.consoles.delete(port);
                    void this.releaseLog(port);
                }
            })
        );
    }

    private portForTerminal(terminal: vscode.Terminal): number | undefined {
        for (const [port, open] of this.consoles) {
            if (open === terminal) {
                return port;
            }
        }
        return undefined;
    }

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
            'Maya link — click to open the command palette';
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

                case 'console': {
                    await this.openConsole(message.port);
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

    // Tell Maya we are here. No exec() wrapper: sendToMaya prepends the anti-echo
    // import, so the payload is already multi-line and will not run twice.
    private async notifyMaya(port: number, action: 'connect' | 'ping') {
        try {
            await sendToMaya(port, `print("mayaLink.${action} -> Port: ${port}")`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to ${action} Maya on port ${port}`);
        }
    }

    // tail is the terminal's own process, so nothing typed can run. One per port,
    // so several instances can be watched side by side.
    private async openConsole(port: number): Promise<void> {
        // Clicking the icon again on an already-open console reveals it
        const existing = this.consoles.get(port);
        if (existing) {
            existing.show(true);
            return;
        }

        try {
            await enableLog(port);
        } catch (error) {
            trace(`Console: could not enable log for port ${port}: ${error}`);
            vscode.window.showErrorMessage(`Could not open Maya console on port ${port}`);
            return;
        }

        // VS Code spawns shellPath directly, so no shell prompt sits behind tail
        const terminal = vscode.window.createTerminal({
            ...terminalSpec(port),
            name: `Maya (port ${port})`,
        });
        this.consoles.set(port, terminal);

        // preserveFocus: true so opening does not steal your cursor
        terminal.show(true);
        trace(`Console: terminal shown for port ${port}`);

        this.watchInstance(port);
    }

    // A dead Maya leaves tail waiting on a file that never grows again, so the
    // console looks frozen. Say so once. tail -F resumes by itself.
    private watchInstance(port: number): void {
        let misses = 0;

        const timer = setInterval(async () => {
            const alive = (await checkPort(port)) !== null;
            misses = alive ? 0 : misses + 1;

            if (alive && misses === 0 && this.warned.delete(port)) {
                trace(`Console: port ${port} is back`);
            }
            if (misses === MISSES_BEFORE_WARNING && !this.warned.has(port)) {
                this.warned.add(port);
                vscode.window.showWarningMessage(
                    `Maya on port ${port} is not responding. Its console will not update until it does.`
                );
            }
        }, MAYBE_GONE_MS);

        this.watches.set(port, timer);
    }

    // Put Maya's history logging back the way we found it, and drop the log
    private async releaseLog(port: number): Promise<void> {
        const timer = this.watches.get(port);
        if (timer) {
            clearInterval(timer);
            this.watches.delete(port);
        }
        this.warned.delete(port);

        try {
            await disableLog(port);
        } catch {
            // Maya may already be gone; nothing to reset
        }
        removeLog(port);
    }

    // Close every console. Used when the window shuts down.
    private closeAllConsoles(): void {
        const open = [...this.consoles.entries()];
        // Cleared first so the close events, which arrive later, do not
        // release the same logs a second time
        this.consoles.clear();
        for (const [port, terminal] of open) {
            terminal.dispose();
            void this.releaseLog(port);
        }
        // releaseLog only covers ports that had a console; clear any stragglers
        for (const port of [...this.watches.keys()]) {
            void this.releaseLog(port);
        }
    }

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

        html = html
            .replaceAll('{{ stylesUri }}', stylesUri.toString())
            .replaceAll('{{ appUri }}', appUri.toString())
            .replaceAll('{{ cspSource }}', webviewView.webview.cspSource);

        return html;
    }
}