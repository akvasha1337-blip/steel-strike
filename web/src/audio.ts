import type { SoundName } from './engine/types';
import { settings } from './settings';

/** All sounds are synthesised with Web Audio: no files to download, nothing copyrighted. */
let ctx: AudioContext | null = null;

const CATEGORY: Record<SoundName, keyof ReturnType<typeof settings.get>['mute']> = {
  standby: 'timer',
  beep: 'timer',
  tick: 'timer',
  go: 'timer',
  end: 'timer',
  ding: 'hits',
  buzz: 'alerts',
  record: 'music',
};

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
}

function out(): { ac: AudioContext; dest: GainNode } | null {
  if (!ctx) unlockAudio();
  if (!ctx) return null;
  const g = ctx.createGain();
  g.gain.value = settings.get().volume;
  g.connect(ctx.destination);
  return { ac: ctx, dest: g };
}

function tone(ac: AudioContext, dest: AudioNode, type: OscillatorType, freq: number, start: number, dur: number, peak: number, attack = 0.004) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.05);
  return o;
}

export function play(name: SoundName, opt: { id?: number } = {}) {
  const s = settings.get();
  if (s.volume <= 0 || s.mute[CATEGORY[name]]) return;
  const o = out();
  if (!o) return;
  const { ac, dest } = o;
  const t = ac.currentTime + 0.005;
  switch (name) {
    case 'beep': // classic shot-timer start: loud, square, ~2.4 kHz
      tone(ac, dest, 'square', 2400, t, 0.42, 0.35, 0.002);
      break;
    case 'standby':
      tone(ac, dest, 'sine', 660, t, 0.18, 0.25);
      break;
    case 'tick':
      tone(ac, dest, 'square', 1200, t, 0.05, 0.18, 0.001);
      break;
    case 'go':
      {
        const osc = tone(ac, dest, 'triangle', 700, t, 0.22, 0.35);
        osc.frequency.exponentialRampToValueAtTime(1400, t + 0.15);
      }
      break;
    case 'ding': {
      // Struck steel: a few inharmonic partials with fast decay. Pitch varies a little per plate.
      const id = opt.id ?? 1;
      const f = 820 + id * 65 + (Math.random() * 30 - 15);
      const partials: [number, number, number][] = [
        [1, 0.5, 1.1],
        [2.76, 0.25, 0.6],
        [5.4, 0.12, 0.35],
        [8.93, 0.06, 0.2],
      ];
      for (const [m, a, d] of partials) tone(ac, dest, 'sine', f * m, t, d, a, 0.001);
      // short noise "clank" transient
      const len = Math.floor(ac.sampleRate * 0.03);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const n = ac.createBufferSource();
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500;
      const ng = ac.createGain();
      ng.gain.value = 0.25;
      n.buffer = buf;
      n.connect(hp).connect(ng).connect(dest);
      n.start(t);
      break;
    }
    case 'buzz': {
      const osc = ac.createOscillator();
      const lp = ac.createBiquadFilter();
      const g = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 130;
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
      g.gain.setValueAtTime(0.35, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(lp).connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.5);
      break;
    }
    case 'end':
      tone(ac, dest, 'square', 1800, t, 0.16, 0.22);
      tone(ac, dest, 'square', 1200, t + 0.2, 0.3, 0.22);
      break;
    case 'record': {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone(ac, dest, 'triangle', f, t + i * 0.12, i === 3 ? 0.6 : 0.16, 0.3));
      break;
    }
  }
}

export function say(text: string) {
  if (!settings.get().voice || settings.get().volume <= 0) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.volume = Math.min(1, settings.get().volume + 0.1);
    synth.speak(u);
  } catch {}
}
