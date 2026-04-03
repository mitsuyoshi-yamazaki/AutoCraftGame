import { describe, it, expect } from 'vitest';
import { createWorld, createRng, distance, circlesOverlap, DEFAULT_WORLD_CONFIG } from '../src/world.js';

describe('world', () => {
  describe('distance', () => {
    it('computes Euclidean distance', () => {
      expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5.0);
    });

    it('distance to self is 0', () => {
      expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    });
  });

  describe('circlesOverlap', () => {
    it('overlapping circles', () => {
      expect(circlesOverlap({ x: 0, y: 0 }, 1, { x: 1, y: 0 }, 1)).toBe(true);
    });

    it('non-overlapping circles', () => {
      expect(circlesOverlap({ x: 0, y: 0 }, 0.4, { x: 5, y: 0 }, 0.4)).toBe(false);
    });
  });

  describe('createWorld', () => {
    it('creates world with correct node counts', () => {
      const rng = createRng(42);
      const world = createWorld(DEFAULT_WORLD_CONFIG, rng);
      const oreCount = world.resourceNodes.filter((n) => n.type === 'OreNode').length;
      const crystalCount = world.resourceNodes.filter((n) => n.type === 'CrystalNode').length;
      expect(oreCount).toBe(DEFAULT_WORLD_CONFIG.oreNodeCount);
      expect(crystalCount).toBe(DEFAULT_WORLD_CONFIG.crystalNodeCount);
      expect(world.energyNodes.length).toBe(DEFAULT_WORLD_CONFIG.energyNodeCount);
    });

    it('all nodes have IDs', () => {
      const rng = createRng(42);
      const world = createWorld(DEFAULT_WORLD_CONFIG, rng);
      for (const n of world.resourceNodes) expect(n.id).toBeTruthy();
      for (const n of world.energyNodes) expect(n.id).toBeTruthy();
    });

    it('node positions are within world bounds', () => {
      const rng = createRng(42);
      const world = createWorld(DEFAULT_WORLD_CONFIG, rng);
      for (const n of world.resourceNodes) {
        expect(n.position.x).toBeGreaterThan(0);
        expect(n.position.x).toBeLessThan(world.width);
        expect(n.position.y).toBeGreaterThan(0);
        expect(n.position.y).toBeLessThan(world.height);
      }
    });
  });
});
