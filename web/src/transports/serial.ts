import { LineSplitter } from '../protocol';
import type { Transport } from './types';

// Common USB-serial chips on ESP32 boards: Silicon Labs CP210x, WCH CH340/CH9102, FTDI, Espressif native USB.
const FILTERS = [{ usbVendorId: 0x10c4 }, { usbVendorId: 0x1a86 }, { usbVendorId: 0x0403 }, { usbVendorId: 0x303a }];

export class SerialTransport implements Transport {
  readonly kind = 'serial' as const;
  readonly label = 'USB';
  onLine = (_l: string) => {};
  onDrop = (_r: string) => {};
  private port: any = null;
  private reader: any = null;
  private writer: any = null;
  private closing = false;
  private queue: Promise<void> = Promise.resolve();
  private enc = new TextEncoder();
  private splitter = new LineSplitter((l) => this.onLine(l));

  async connect() {
    const serial = (navigator as any).serial;
    try {
      this.port = await serial.requestPort({ filters: FILTERS });
    } catch (e: any) {
      if (e?.name === 'NotFoundError') {
        // No matching chip found; let the user pick any port.
        this.port = await serial.requestPort();
      } else throw e;
    }
    await this.open();
  }

  async reconnect() {
    const ports: any[] = await (navigator as any).serial.getPorts();
    const info = this.port?.getInfo?.();
    const again = ports.find((p) => {
      const i = p.getInfo();
      return info && i.usbVendorId === info.usbVendorId && i.usbProductId === info.usbProductId;
    });
    if (!again) throw new Error('Hub not plugged in');
    this.port = again;
    await this.open();
  }

  private async open() {
    this.closing = false;
    await this.port.open({ baudRate: 115200, bufferSize: 8192 });
    // Keep DTR/RTS low so opening the port doesn't hold the ESP32 in reset.
    try {
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch {}
    this.writer = this.port.writable.getWriter();
    this.splitter.reset();
    this.readLoop();
  }

  private async readLoop() {
    const dec = new TextDecoder();
    while (this.port?.readable && !this.closing) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) this.splitter.push(dec.decode(value, { stream: true }));
        }
      } catch (e: any) {
        if (!this.closing) {
          this.cleanup();
          this.onDrop(e?.message || 'USB disconnected');
          return;
        }
      } finally {
        try {
          this.reader.releaseLock();
        } catch {}
      }
    }
  }

  send(line: string) {
    if (!this.writer) return;
    const bytes = this.enc.encode(line);
    this.queue = this.queue.then(() => this.writer?.write(bytes)).catch(() => {});
  }

  private cleanup() {
    try { this.writer?.releaseLock(); } catch {}
    this.writer = null;
    this.port?.close().catch(() => {});
  }

  async disconnect() {
    this.closing = true;
    try { await this.reader?.cancel(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    this.writer = null;
    try { await this.port?.close(); } catch {}
  }
}
