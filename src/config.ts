import * as vscode from 'vscode';

const PORT_KEY = 'mayaPort';

// Get the saved Maya port for the current workspace
export function getWorkspacePort(context: vscode.ExtensionContext): number | undefined {
    return context.workspaceState.get<number>(PORT_KEY);
}

// Save the Maya port for the current workspace
export function setWorkspacePort(context: vscode.ExtensionContext, port: number): Thenable<void> {
    return context.workspaceState.update(PORT_KEY, port);
}

// Clear the saved Maya port
export function clearWorkspacePort(context: vscode.ExtensionContext): Thenable<void> {
    return context.workspaceState.update(PORT_KEY, undefined);
}
