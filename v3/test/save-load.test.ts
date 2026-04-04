import { describe, it, expect } from 'vitest';
import { serialize, deserialize, VersionMismatchError, formatTimestamp, buildSaveFileName } from '../src/save-load.js';
import type { SaveData } from '../src/save-load.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { GAME_VERSION } from '../src/version.js';

function makeSaveData(): SaveData {
  return {
    version: GAME_VERSION.toString(),
    sessionStartedAt: '20260404_153012',
    params: DEFAULT_GAME_PARAMS,
    world: {
      width: 20,
      height: 20,
      resourceNodes: [],
      energyNodes: [],
      remains: [],
      characters: [],
      nextCharacterId: 1,
      nextObjectId: 1,
      tick: 42,
    },
    stats: { totalBirths: 10, totalDeaths: 5 },
    recentEvents: [
      { tick: 40, event: { type: 'character_spawned', parentId: 'c1', childId: 'c2' } },
      { tick: 41, event: { type: 'character_died', id: 'c3' } },
    ],
  };
}

describe('save-load', () => {
  describe('serialize / deserialize roundtrip', () => {
    it('preserves all data', () => {
      const data = makeSaveData();
      const json = serialize(data);
      const restored = deserialize(json);
      expect(restored.version).toBe(data.version);
      expect(restored.sessionStartedAt).toBe(data.sessionStartedAt);
      expect(restored.world.tick).toBe(42);
      expect(restored.stats.totalBirths).toBe(10);
      expect(restored.stats.totalDeaths).toBe(5);
      expect(restored.recentEvents).toHaveLength(2);
      expect(restored.params.moveForce).toBe(DEFAULT_GAME_PARAMS.moveForce);
    });
  });

  describe('version check', () => {
    it('rejects different major version', () => {
      const data = makeSaveData();
      const json = serialize({ ...data, version: '2.10.0' });
      expect(() => deserialize(json)).toThrow(VersionMismatchError);
    });

    it('rejects different minor version', () => {
      const data = makeSaveData();
      const json = serialize({ ...data, version: `${GAME_VERSION.major}.${GAME_VERSION.minor + 1}.0` });
      expect(() => deserialize(json)).toThrow(VersionMismatchError);
    });

    it('accepts different patch version', () => {
      const data = makeSaveData();
      const json = serialize({ ...data, version: `${GAME_VERSION.major}.${GAME_VERSION.minor}.99` });
      const restored = deserialize(json);
      expect(restored.world.tick).toBe(42);
    });
  });

  describe('formatTimestamp', () => {
    it('formats date as YYYYMMDD_HHMMSS', () => {
      const date = new Date(2026, 3, 4, 15, 30, 12); // April 4, 2026 15:30:12
      expect(formatTimestamp(date)).toBe('20260404_153012');
    });
  });

  describe('buildSaveFileName', () => {
    it('builds name without resumedAt', () => {
      expect(buildSaveFileName('20260404_153012', null, 500))
        .toBe('20260404_153012_tick500.json');
    });

    it('builds name with resumedAt', () => {
      expect(buildSaveFileName('20260404_153012', '20260405_091500', 750))
        .toBe('20260404_153012_20260405_091500_tick750.json');
    });
  });
});
