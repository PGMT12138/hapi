declare module 'ws' {
    type Data = Buffer | ArrayBuffer | Buffer[];

    interface CloseEvent {
        wasClean: boolean;
        code: number;
        reason: string;
    }

    interface ErrorEvent {
        message: string;
        error?: Error;
    }

    interface WebSocket extends EventTarget {
        readonly CONNECTING: 0;
        readonly OPEN: 1;
        readonly CLOSING: 2;
        readonly CLOSED: 3;

        readonly readyState: number;
        readonly url: string;
        readonly protocol: string;

        onopen: ((event: Event) => void) | null;
        onclose: ((event: CloseEvent) => void) | null;
        onerror: ((event: ErrorEvent) => void) | null;
        onmessage: ((event: { data: Data; type: string; target: WebSocket }) => void) | null;

        send(data: Buffer | ArrayBuffer | string): void;
        close(code?: number, reason?: string): void;

        on(event: 'open', listener: () => void): WebSocket;
        on(event: 'close', listener: (code: number, reason: Buffer) => void): WebSocket;
        on(event: 'error', listener: (err: Error) => void): WebSocket;
        on(event: 'message', listener: (data: Data) => void): WebSocket;

        once(event: 'open', listener: () => void): WebSocket;
        once(event: 'close', listener: (code: number, reason: Buffer) => void): WebSocket;
        once(event: 'error', listener: (err: Error) => void): WebSocket;
        once(event: 'message', listener: (data: Data) => void): WebSocket;
    }

    interface WebSocketConstructor {
        new (url: string, protocols?: string | string[], options?: Record<string, unknown>): WebSocket;
        (url: string, protocols?: string | string[], options?: Record<string, unknown>): WebSocket;
        readonly CONNECTING: 0;
        readonly OPEN: 1;
        readonly CLOSING: 2;
        readonly CLOSED: 3;
    }

    const WebSocket: WebSocketConstructor;
    export = WebSocket;
}
