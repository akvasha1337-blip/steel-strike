import type { ModeDef } from '../engine/types';
import { freePractice, speedClear, timedChallenge } from './basic';
import { custom, makeTournament } from './meta';
import { reaction, sequence } from './reaction';
import { headToHead, steal } from './versus';

const base: ModeDef[] = [freePractice, speedClear, timedChallenge, reaction, sequence, headToHead, steal];
const tournament = makeTournament(() => MODES);

export const MODES: ModeDef[] = [...base, tournament, custom];

export function modeById(id: string): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}
