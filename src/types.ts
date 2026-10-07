export interface MayaInstance {
    port: number;
    status: 'connected' | 'disconnected';
    sceneName: string | null;
    version: string | null;
}
