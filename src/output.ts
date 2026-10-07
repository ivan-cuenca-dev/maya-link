import * as vscode from 'vscode';

const CHANNEL_NAME = 'Maya link';

let channel: vscode.OutputChannel | undefined;

// Create (once) and return the shared output channel
export function getOutputChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel(CHANNEL_NAME);
    }
    return channel;
}

// Always-on diagnostics
export function log(message: string): void {
    getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}

// Verbose diagnostics, only written when mayaLink.debug is enabled
export function trace(message: string): void {
    if (vscode.workspace.getConfiguration('mayaLink').get<boolean>('debug', false)) {
        getOutputChannel().appendLine(`[${new Date().toISOString()}] TRACE ${message}`);
    }
}