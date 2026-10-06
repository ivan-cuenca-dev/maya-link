import { MayaInstance } from './types';
import { findOpenPorts } from './portScanner';
import { sendToMaya } from './mayaConnection';
import { cleanResponse } from './parse';
import { trace } from './output';

// Both queries are single lines with no import statement. That matters: when a
// commandPort payload contains an import or spans multiple lines, Maya switches
// to exec() semantics and always answers "None", discarding the reply. `cmds`
// is already in commandPort's namespace for a port opened with
// sourceType="python", so no import is needed.
// antiEcho is false for both: they never print, and the prefix would
// otherwise turn them into multi-line payloads.
const SCENE_NAME_COMMAND = 'cmds.file(query=True, sceneName=True)';
const VERSION_COMMAND = 'cmds.about(product=True)';

// An unsaved scene reports no path, which reads better as "untitled".
// Anything else is reduced to the bare filename.
function interpretSceneName(value: string): string | null {
    if (!value || value === 'None' || value === 'null') {
        return 'untitled';
    }
    return value.split('/').pop()?.split('\\').pop() || value;
}

export class MayaService {
    private instances: MayaInstance[] = [];

    /**
     * Port restored from persisted config on first refresh. Nothing is
     * connected until the user connects, but this lets refresh() keep the
     * connected status across a window reload instead of resetting it.
     */
    private restoredPort: number | undefined;

    constructor(restoredPort?: number) {
        this.restoredPort = restoredPort;
    }

    // Return a copy so callers cannot mutate internal state
    getInstances(): MayaInstance[] {
        return this.instances.map((instance) => ({ ...instance }));
    }

    async refresh(): Promise<MayaInstance[]> {
        const ports = await findOpenPorts();

        // Carry over status, scene name and version for ports we already knew
        const previous = new Map(
            this.instances.map((instance) => [instance.port, instance])
        );

        this.instances = ports.map((port) => {
            const before = previous.get(port);
            const wasRestored = port === this.restoredPort;

            return {
                port,
                status: before?.status ?? (wasRestored ? 'connected' : 'disconnected'),
                sceneName: before?.sceneName ?? null,
                version: before?.version ?? null,
            };
        });

        // Only seed once; afterwards the in-memory list is the source of truth
        this.restoredPort = undefined;

        // Query every instance concurrently, and both queries per instance in
        // parallel, so one unresponsive Maya cannot delay the others
        await Promise.all(
            this.instances.map(async (instance) => {
                [instance.sceneName, instance.version] = await Promise.all([
                    this.query(instance.port, SCENE_NAME_COMMAND, interpretSceneName),
                    this.query(instance.port, VERSION_COMMAND, (v) => v || null),
                ]);
            })
        );

        return this.getInstances();
    }

    connect(port: number): MayaInstance[] {
        this.instances = this.instances.map((instance) => ({
            ...instance,
            status: instance.port === port ? 'connected' : 'disconnected',
        }));
        return this.getInstances();
    }

    disconnect(port: number): MayaInstance[] {
        this.instances = this.instances.map((instance) =>
            instance.port === port ? { ...instance, status: 'disconnected' } : { ...instance }
        );
        return this.instances;
    }

    // Run a single-line query and clean the reply. Returns null when the port
    // does not answer, so one unresponsive Maya never breaks the scan.
    private async query(
        port: number,
        command: string,
        interpret: (value: string) => string | null
    ): Promise<string | null> {
        try {
            return interpret(cleanResponse(await sendToMaya(port, command, false)));
        } catch (error) {
            trace(`Query "${command}" failed on port ${port}`);
            return null;
        }
    }
}