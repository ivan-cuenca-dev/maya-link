import * as vscode from 'vscode';
import { registerMayaPanel } from './panel/MayaPanel';
import { getWorkspacePort } from './config';
import { sendToMaya } from './mayaConnection';
import { registerSetupCommands } from './setup';
import { getOutputChannel, log } from './output';

export function activate(context: vscode.ExtensionContext) {
    getOutputChannel();

    const provider = registerMayaPanel(context);
    registerSetupCommands(context);

    // Refresh button in the panel title bar
    context.subscriptions.push(
        vscode.commands.registerCommand('mayaLink.refresh', () => {
            provider.refresh();
        })
    );

    // Send the selection (or whole file) from the active editor to Maya
    context.subscriptions.push(
        vscode.commands.registerCommand('mayaLink.sendCode', async () => {
            const port = getWorkspacePort(context);
            if (!port) {
                vscode.window.showErrorMessage('Not connected to any Maya instance');
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor to send code from');
                return;
            }

            // Send the whole document when nothing is selected
            const selection = editor.selection;
            const code = selection.isEmpty
                ? editor.document.getText()
                : editor.document.getText(selection);

            if (!code.trim()) {
                vscode.window.showErrorMessage('No code to send');
                return;
            }

            // Wrap the code so a failure is reported inside Maya's Script
            // Editor, where it can be read and debugged. The exception is
            // deliberately not re-raised: commandPort sees a clean exit, so
            // the socket carries nothing back and VS Code stays quiet.
            const payload = [
                'import maya.cmds as cmds',
                'try:',
                `    exec(${JSON.stringify(code)})`,
                'except Exception:',
                '    import traceback',
                '    print(traceback.format_exc())',
            ].join('\n');

            try {
                // antiEcho false: the wrapper is already multi-line, and
                // skipping the prefix keeps traceback line numbers aligned
                // with the editor.
                await sendToMaya(port, payload, false);
                // Intentionally silent — the outcome is in Maya
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                log(`Failed to send code to Maya: ${message}`);
                vscode.window.showErrorMessage(`Failed to send code to Maya: ${message}`);
            }
        })
    );
}

export function deactivate() {}