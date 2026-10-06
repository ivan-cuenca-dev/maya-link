import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Read from dist/, not src/. .vscodeignore excludes src/ from the packaged
// extension, so these files only exist in dist when installed.
const SETUP_DIR = path.join('dist', 'setup');
const SETUP_FILE = 'mayaSetup.py';

// Read the Python setup snippet from disk
function readSetupScript(context: vscode.ExtensionContext): string {
    const filePath = path.join(context.extensionUri.fsPath, SETUP_DIR, SETUP_FILE);
    return fs.readFileSync(filePath, 'utf-8');
}

// Open the snippet as an untitled Python document so it can be read
async function showSetupScript(context: vscode.ExtensionContext) {
    const document = await vscode.workspace.openTextDocument({
        content: readSetupScript(context),
        language: 'python',
    });
    await vscode.window.showTextDocument(document);
}

// Copy the snippet to the clipboard, with a shortcut to view it instead
async function copySetupScript(context: vscode.ExtensionContext) {
    await vscode.env.clipboard.writeText(readSetupScript(context));

    const choice = await vscode.window.showInformationMessage(
        'Maya setup script copied — paste it into Maya\'s Script Editor (Python tab) and run it.',
        'Show script'
    );

    if (choice === 'Show script') {
        await showSetupScript(context);
    }
}

export function registerSetupCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('mayaLink.copySetup', () =>
            copySetupScript(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mayaLink.showSetup', () =>
            showSetupScript(context)
        )
    );
}