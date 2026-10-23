export type TransportKind = 'serial' | 'ble' | 'ws' | 'sim';

export interface Transport {
  readonly kind: TransportKind;
  readonly label: string;
  /** Called for every complete line received. */
  onLine: (line: string) => void;
  /** Called when the link drops unexpectedly (not after disconnect()). */
  onDrop: (reason: string) => void;
  connect(): Promise<void>;
  /** Re-open after a drop without asking the user to pick a device again. */
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
  send(line: string): void;
}

export const BLE_SERVICE = 'b8a1e2c0-5a1f-4c3b-9d7e-5354524b0001';
export const BLE_TX = 'b8a1e2c0-5a1f-4c3b-9d7e-5354524b0002'; // hub -> app (notify)
export const BLE_RX = 'b8a1e2c0-5a1f-4c3b-9d7e-5354524b0003'; // app -> hub (write)

export interface Availability {
  ok: boolean;
  why?: string;
}

function policyAllows(feature: string): boolean {
  const fp = (document as any).permissionsPolicy || (document as any).featurePolicy;
  try {
    return fp ? fp.allowsFeature(feature) : true;
  } catch {
    return true;
  }
}

export function availability(kind: TransportKind): Availability {
  const nav = navigator as any;
  if (kind === 'sim') return { ok: true };
  if (kind === 'ws') {
    if (location.protocol === 'https:')
      return { ok: false, why: 'Wi-Fi works when you open the app from the hub itself: http://steelstrike.local or http://192.168.4.1' };
    return { ok: true };
  }
  if (!window.isSecureContext) return { ok: false, why: 'Needs the hosted https:// version of the app (Chrome or Edge).' };
  if (kind === 'serial') {
    if (!('serial' in nav)) return { ok: false, why: 'USB needs Chrome or Edge on a computer. Phones and Safari can’t use it.' };
    if (!policyAllows('serial')) return { ok: false, why: 'This page is embedded and the browser blocks USB here. Open the hosted app directly.' };
    return { ok: true };
  }
  if (!('bluetooth' in nav)) return { ok: false, why: 'Bluetooth needs Chrome or Edge (computer or Android). iPhone browsers can’t use it.' };
  if (!policyAllows('bluetooth')) return { ok: false, why: 'This page is embedded and the browser blocks Bluetooth here. Open the hosted app directly.' };
  return { ok: true };
}
