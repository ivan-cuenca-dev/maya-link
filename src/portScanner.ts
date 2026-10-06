import * as net from 'net';
import { HOST } from './mayaConnection';

const PORT_RANGE_START = 7000;
const PORT_RANGE_END = 7100;
const PROBE_TIMEOUT_MS = 500;

// Find every port in the commandPort range that is accepting connections.
// Probes run concurrently so a slow or filtered port cannot stall the scan.
export function findOpenPorts(): Promise<number[]> {
    const probes: Promise<number | null>[] = [];

    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
        probes.push(checkPort(port));
    }

    return Promise.all(probes).then((results) =>
        results.filter((port): port is number => port !== null)
    );
}

// Resolve the port if something is listening, otherwise null
function checkPort(port: number): Promise<number | null> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(PROBE_TIMEOUT_MS);

        const finish = (result: number | null) => {
            socket.destroy();
            resolve(result);
        };

        socket.once('connect', () => finish(port));
        socket.once('timeout', () => finish(null));
        socket.once('error', () => finish(null));

        socket.connect(port, HOST);
    });
}