import type { World, SimulationEvent } from './types.js';
import type { GameParams } from './params.js';
import { GAME_VERSION, SemanticVersion } from './version.js';

// ============================================================
// SaveData — the shape of a save file
// ============================================================
export interface SaveData {
  version: string;
  sessionStartedAt: string;
  params: GameParams;
  world: World;
  stats: {
    totalBirths: number;
    totalDeaths: number;
  };
  recentEvents: SavedEvent[];
}

export interface SavedEvent {
  tick: number;
  event: SimulationEvent;
}

// ============================================================
// Serialize
// ============================================================
export function serialize(data: SaveData): string {
  return JSON.stringify(data, null, 2);
}

// ============================================================
// Deserialize with version compatibility check
// ============================================================
export class VersionMismatchError extends Error {
  constructor(saved: string, current: string) {
    super(`Version mismatch: save file is v${saved}, but current version is v${current}. Major and minor versions must match.`);
    this.name = 'VersionMismatchError';
  }
}

export function deserialize(json: string): SaveData {
  const raw = JSON.parse(json);

  if (!raw.version || !raw.params || !raw.world) {
    throw new Error('Invalid save file: missing required fields');
  }

  const parts = raw.version.split('.').map(Number);
  const savedVersion = new SemanticVersion(parts[0], parts[1], parts[2]);

  if (savedVersion.compareMajor(GAME_VERSION) !== 0 || savedVersion.compareMinor(GAME_VERSION) !== 0) {
    throw new VersionMismatchError(raw.version, GAME_VERSION.toString());
  }

  return {
    version: raw.version,
    sessionStartedAt: raw.sessionStartedAt ?? '',
    params: raw.params as GameParams,
    world: raw.world as World,
    stats: {
      totalBirths: raw.stats?.totalBirths ?? 0,
      totalDeaths: raw.stats?.totalDeaths ?? 0,
    },
    recentEvents: raw.recentEvents ?? [],
  };
}

// ============================================================
// Timestamp formatting helpers
// ============================================================
export function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function buildSaveFileName(
  sessionStartedAt: string,
  resumedAt: string | null,
  tick: number,
): string {
  if (resumedAt) {
    return `${sessionStartedAt}_${resumedAt}_tick${tick}.json`;
  }
  return `${sessionStartedAt}_tick${tick}.json`;
}
