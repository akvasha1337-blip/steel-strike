import { LineSplitter } from '../protocol';
import { BLE_RX, BLE_SERVICE, BLE_TX, type Transport } from './types';

export class BleTransport implements Transport {
  readonly kind = 'ble' as const;
  readonly label = 'Bluetooth';
  onLine = (_l: string) => {};
  onDrop = (_r: string) => {};
  private device: any = null;
  private rx: any = null;
  private closing = false;
  private queue: Promise<void> = Promise.resolve();
  private enc = new TextEncoder();
  private splitter = new LineSplitter((l) => this.onLine(l));
  private dropHandler = () => {
    this.rx = null;
    if (!this.closing) this.onDrop('Bluetooth link lost');
  };

  async connect() {
    this.device = await (navigator as any).bluetooth.requestDevice({
      filters: [{ services: [BLE_SERVICE] }, { namePrefix: 'SteelStrike' }],
      optionalServices: [BLE_SERVICE],
    });
    this.device.addEventListener('gattserverdisconnected', this.dropHandler);
    await this.open();
  }

  async reconnect() {
    if (!this.device) throw new Error('No hub selected');
    await this.open();
  }

  private async open() {
    this.closing = false;
    const server = await this.device.gatt.connect();
    const svc = await server.getPrimaryService(BLE_SERVICE);
    const tx = await svc.getCharacteristic(BLE_TX);
    this.rx = await svc.getCharacteristic(BLE_RX);
    const dec = new TextDecoder();
    this.splitter.reset();
    tx.addEventListener('characteristicvaluechanged', (e: any) => {
      this.splitter.push(dec.decode(e.target.value));
    });
    await tx.startNotifications();
  }

  send(line: string) {
    if (!this.rx) return;
    const bytes = this.enc.encode(line);
    // Chunk to fit small MTUs; the hub reassembles by newline.
    for (let i = 0; i < bytes.length; i += 180) {
      const part = bytes.slice(i, i + 180);
      this.queue = this.queue.then(() => this.rx?.writeValueWithResponse(part)).catch(() => {});
    }
  }

  async disconnect() {
    this.closing = true;
    try { this.device?.gatt?.disconnect(); } catch {}
    this.rx = null;
  }
}
