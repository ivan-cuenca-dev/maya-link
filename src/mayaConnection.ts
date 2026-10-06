import * as net from 'net';
import { trace } from './output';


export const HOST = '127.0.0.1';
const TIMEOUT_MS = 5000;

const ANTI_ECHO_PREFIX = 'import maya.cmds as cmds\n';

export function sendToMaya(
    port: number,
    code: string,
    antiEcho: boolean = true
): Promise<string> {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let settled = false;

        const finish = (error: Error | null, response = '') => {
            if (settled) {
                return;
            }
            settled = true;
            client.destroy();
            if (error) {
                trace(`Port ${port} failed: ${error.message}`);
                reject(error);
            } else {
                trace(`Port ${port} responded with ${response.length} chars`);
                resolve(response);
            }
        };

        client.setTimeout(TIMEOUT_MS);

        client.on('connect', () => {
            trace(`Port ${port} connected, writing ${code.length} chars`);
            client.write(`${antiEcho ? ANTI_ECHO_PREFIX : ''}${code}\n`);
        });

        client.on('data', (data) => finish(null, data.toString().trim()));

        client.on('timeout', () => finish(new Error('Connection timed out')));

        client.on('error', (err) => finish(err));

        client.connect(port, HOST);
    });
}