declare module 'ws' {
  import { EventEmitter } from 'node:events';

  export default class WebSocket extends EventEmitter {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;

    readonly readyState: number;
    binaryType: string;

    constructor(address: string | URL, options?: any);

    send(data: any, cb?: (err?: Error) => void): void;
    close(code?: number, data?: string): void;
    terminate(): void;
    ping(data?: any, mask?: boolean, cb?: (err?: Error) => void): void;
    pong(data?: any, mask?: boolean, cb?: (err?: Error) => void): void;
  }
}
