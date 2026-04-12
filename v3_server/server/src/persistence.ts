import fs from 'node:fs';
import path from 'node:path';
import type { World } from './simulation/types.js';
import type { GameParams } from './simulation/params.js';
import type { WorldConfig } from './simulation/world.js';

// ============================================================
// Save data format
// ============================================================
export interface WorldSaveData {
  id: string;
  name: string;
  params: GameParams;
  config: WorldConfig;
  seed: number;
  world: World;
  totalBirths: number;
  totalDeaths: number;
  createdAt: string;
  savedAt: string;
  ticksPerSecond: number;
}

// ============================================================
// Persistence — file-based JSON storage
// ============================================================
export class Persistence {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    fs.mkdirSync(path.join(dataDir, 'worlds'), { recursive: true });
  }

  private worldDir(worldId: string): string {
    return path.join(this.dataDir, 'worlds', worldId);
  }

  saveWorld(data: WorldSaveData): void {
    const dir = this.worldDir(data.id);
    fs.mkdirSync(dir, { recursive: true });

    const statePath = path.join(dir, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(data, null, 2), 'utf-8');

    // Checkpoint copy
    const checkpointDir = path.join(dir, 'checkpoints');
    fs.mkdirSync(checkpointDir, { recursive: true });
    const timestamp = formatTimestamp(new Date());
    const checkpointPath = path.join(checkpointDir, `${timestamp}.json`);
    fs.copyFileSync(statePath, checkpointPath);
  }

  loadWorld(worldId: string): WorldSaveData | null {
    const statePath = path.join(this.worldDir(worldId), 'state.json');
    if (!fs.existsSync(statePath)) return null;

    const json = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(json) as WorldSaveData;
  }

  listWorlds(): string[] {
    const worldsDir = path.join(this.dataDir, 'worlds');
    if (!fs.existsSync(worldsDir)) return [];
    return fs.readdirSync(worldsDir).filter((name) => {
      const statePath = path.join(worldsDir, name, 'state.json');
      return fs.existsSync(statePath);
    });
  }

  deleteWorld(worldId: string): void {
    const dir = this.worldDir(worldId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
    }
  }
}

// ============================================================
// Helpers
// ============================================================
function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
