import { LineSplitter } from '../protocol';
import type { Transport } from './types';

export function defaultWsUrl(): string {
  return `ws://${location.host || 'steelstrike.local'}/ws`;
}

export class WsTransport implements Transport {
  readonly kind = 'ws' as const;
  readonly label = 'Wi-Fi';
  onLine = (_l: string) => {};
  onDrop = (_r: string) => {};
  private ws: WebSocket | null = null;
  private closing = false;
  private splitter = new LineSplitter((l) => this.onLine(l));
  constructor(private url = defaultWsUrl()) {}

  connect() {
    return this.open();
  }
  reconnect() {
    return this.open();
  }

  private open(): Promise<void> {
    this.closing = false;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      let opened = false;
      const timer = setTimeout(() => {
        if (!opened) {
          ws.close();
          reject(new Error('Hub did not answer on ' + this.url));
        }
      }, 6000);
      ws.onopen = () => {
        opened = true;
        clearTimeout(timer);
        this.ws = ws;
        this.splitter.reset();
        resolve();
      };
      ws.onmessage = (e) => this.splitter.push(typeof e.data === 'string' ? (e.data.endsWith('\n') ? e.data : e.data + '\n') : '');
      ws.onclose = () => {
        clearTimeout(timer);
        if (!opened) return reject(new Error('Could not reach ' + this.url));
        this.ws = null;
        if (!this.closing) this.onDrop('Wi-Fi link lost');
      };
    });
  }

  send(line: string) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(line);
  }

  async disconnect() {
    this.closing = true;
    this.ws?.close();
    this.ws = null;
  }
}
