import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { sendToMaya } from './mayaConnection';

// One log file per Maya instance, so instances never share output
export function logPath(port: number): string {
    return path.join(os.tmpdir(), `mayaLink-${port}.log`);
}

// Ask Maya to write its Script Editor history to that file. Idempotent, so it
// does not matter whether the preference survived a VS Code restart.
export async function enableLog(port: number): Promise<void> {
    // JSON.stringify is also a valid Python string literal, and it doubles
    // backslashes, which matters for the temp path on Windows.
    const literal = JSON.stringify(logPath(port));
    await sendToMaya(
        port,
        `cmds.scriptEditorInfo(historyFilename=${literal}, writeHistory=True)`
    );
}

export async function disableLog(port: number): Promise<void> {
    await sendToMaya(port, 'cmds.scriptEditorInfo(writeHistory=False)');
}

// Delete the log. Ignores failures: on Windows the file is still held open by
// the tail process for a moment after the terminal closes, so this often
// cannot win the race and the file is left for the OS temp cleaner.
export function removeLog(port: number): void {
    try {
        fs.unlinkSync(logPath(port));
    } catch {
        // Still in use, or already gone
    }
}

// tail as the terminal's own process, so no shell prompt sits behind it and
// nothing typed can run. -echo/-ixon keep stray keys from disturbing the
// output; the trap makes Ctrl+C, Ctrl+Z and Ctrl+\ inert, and an ignored
// signal stays ignored across exec. SIGTERM is deliberately excluded because
// dispose() needs it to kill tail. See DEVELOPING.md.
const POSIX_SCRIPT =
    'stty -echo -ixon 2>/dev/null; trap "" INT TSTP QUIT; exec tail -F -n 0 "$1"';

// PowerShell 7 when present, otherwise the 5.1 that ships with Windows.
// Neither can be made read-only: there is no exec and no trap, so Ctrl+C
// stops the console and leaves a prompt behind it.
function windowsShell(): string {
    try {
        execFileSync('where', ['pwsh.exe'], { stdio: 'ignore' });
        return 'pwsh';
    } catch {
        return 'powershell';
    }
}

export function terminalSpec(port: number): {
    shellPath: string;
    shellArgs: string[];
} {
    const file = logPath(port);
    return process.platform === 'win32'
        ? {
              shellPath: windowsShell(),
              shellArgs: [
                  '-NoProfile',
                  '-Command',
                  // Doubling a quote is how PowerShell escapes it
                  `Get-Content -Wait -Tail 0 -Path '${file.replace(/'/g, "''")}'`,
              ],
          }
        : {
              shellPath: 'sh',
              // The path arrives as $1, so spaces and quotes need no escaping
              shellArgs: ['-c', POSIX_SCRIPT, 'sh', file],
          };
}
