import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Persistence } from '../src/persistence.js';
import type { WorldSaveData } from '../src/persistence.js';
import { DEFAULT_GAME_PARAMS } from '../src/simulation/params.js';
import { DEFAULT_WORLD_CONFIG } from '../src/simulation/world.js';

function makeSaveData(id: string): WorldSaveData {
  return {
    id,
    name: `Test World ${id}`,
    params: DEFAULT_GAME_PARAMS,
    config: DEFAULT_WORLD_CONFIG,
    seed: 42,
    world: {
      width: 60,
      height: 60,
      resourceNodes: [],
      energyNodes: [],
      remains: [],
      characters: [],
      groundGrid: [],
      nextCharacterId: 1,
      nextObjectId: 1,
      tick: 100,
    },
    totalBirths: 10,
    totalDeaths: 5,
    createdAt: '2026-01-01T00:00:00Z',
    savedAt: '2026-01-01T01:00:00Z',
    ticksPerSecond: 10,
  };
}

describe('Persistence', () => {
  let tmpDir: string;
  let persistence: Persistence;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3-test-'));
    persistence = new Persistence(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('saves and loads a world', () => {
    const data = makeSaveData('world-001');
    persistence.saveWorld(data);

    const loaded = persistence.loadWorld('world-001');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('world-001');
    expect(loaded!.world.tick).toBe(100);
    expect(loaded!.totalBirths).toBe(10);
  });

  it('returns null for non-existent world', () => {
    const loaded = persistence.loadWorld('non-existent');
    expect(loaded).toBeNull();
  });

  it('lists saved worlds', () => {
    persistence.saveWorld(makeSaveData('world-001'));
    persistence.saveWorld(makeSaveData('world-002'));

    const ids = persistence.listWorlds();
    expect(ids.sort()).toEqual(['world-001', 'world-002']);
  });

  it('deletes a world', () => {
    persistence.saveWorld(makeSaveData('world-001'));
    persistence.deleteWorld('world-001');

    const loaded = persistence.loadWorld('world-001');
    expect(loaded).toBeNull();
    expect(persistence.listWorlds()).toEqual([]);
  });

  it('creates checkpoint files', () => {
    persistence.saveWorld(makeSaveData('world-001'));

    const checkpointDir = path.join(tmpDir, 'worlds', 'world-001', 'checkpoints');
    const files = fs.readdirSync(checkpointDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^\d{8}_\d{6}\.json$/);
  });
});
