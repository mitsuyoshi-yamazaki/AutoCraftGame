import { describe, it, expect } from 'vitest';
import {
  createWorld,
  createRng,
  isOccupied,
  isInBounds,
  findAdjacentResourceNode,
  depleteResourceNode,
  removeDepletedNodes,
  findAdjacentEnergyNode,
  drainEnergyNode,
  produceEnergy,
  createRemains,
  addRemains,
  findAdjacentRemains,
  updateRemains,
  DEFAULT_WORLD_CONFIG,
} from '../src/world.js';
import type { World } from '../src/types.js';

function emptyWorld(w = 10, h = 10): World {
  return {
    width: w, height: h,
    resourceNodes: [], energyNodes: [], remains: [],
    characters: [], nextCharacterId: 1, tick: 0,
  };
}

describe('world', () => {
  describe('createWorld', () => {
    it('creates world with correct node counts', () => {
      const rng = createRng(42);
      const world = createWorld(DEFAULT_WORLD_CONFIG, rng);
      const oreCount = world.resourceNodes.filter((n) => n.type === 'OreNode').length;
      const crystalCount = world.resourceNodes.filter((n) => n.type === 'CrystalNode').length;
      expect(oreCount).toBe(12);
      expect(crystalCount).toBe(12);
      expect(world.energyNodes.length).toBe(8);
    });

    it('no two objects share the same tile', () => {
      const rng = createRng(42);
      const world = createWorld(DEFAULT_WORLD_CONFIG, rng);
      const positions = new Set<string>();
      for (const n of world.resourceNodes) positions.add(`${n.position.x},${n.position.y}`);
      for (const n of world.energyNodes) positions.add(`${n.position.x},${n.position.y}`);
      const totalObjects = world.resourceNodes.length + world.energyNodes.length;
      expect(positions.size).toBe(totalObjects);
    });
  });

  describe('ResourceNode', () => {
    it('findAdjacentResourceNode finds node in adjacent tile', () => {
      const world: World = {
        ...emptyWorld(),
        resourceNodes: [{ position: { x: 3, y: 2 }, type: 'OreNode', remaining: 10 }],
      };
      expect(findAdjacentResourceNode(world, { x: 3, y: 3 })).toBeDefined();
      expect(findAdjacentResourceNode(world, { x: 5, y: 5 })).toBeUndefined();
    });

    it('depleteResourceNode decreases remaining', () => {
      const world: World = {
        ...emptyWorld(),
        resourceNodes: [{ position: { x: 1, y: 1 }, type: 'OreNode', remaining: 5 }],
      };
      const after = depleteResourceNode(world, { x: 1, y: 1 });
      expect(after.resourceNodes[0].remaining).toBe(4);
    });

    it('removeDepletedNodes removes nodes with remaining 0', () => {
      const world: World = {
        ...emptyWorld(),
        resourceNodes: [
          { position: { x: 1, y: 1 }, type: 'OreNode', remaining: 0 },
          { position: { x: 2, y: 2 }, type: 'CrystalNode', remaining: 3 },
        ],
      };
      const after = removeDepletedNodes(world);
      expect(after.resourceNodes.length).toBe(1);
    });
  });

  describe('EnergyNode', () => {
    it('produceEnergy increases stored up to max', () => {
      const world: World = {
        ...emptyWorld(),
        energyNodes: [{ position: { x: 0, y: 0 }, productionRate: 100, stored: 900, maxStored: 1000 }],
      };
      const after = produceEnergy(world);
      expect(after.energyNodes[0].stored).toBe(1000);
    });

    it('produceEnergy clamps at maxStored', () => {
      const world: World = {
        ...emptyWorld(),
        energyNodes: [{ position: { x: 0, y: 0 }, productionRate: 200, stored: 950, maxStored: 1000 }],
      };
      const after = produceEnergy(world);
      expect(after.energyNodes[0].stored).toBe(1000);
    });

    it('drainEnergyNode decreases stored', () => {
      const world: World = {
        ...emptyWorld(),
        energyNodes: [{ position: { x: 1, y: 1 }, productionRate: 100, stored: 500, maxStored: 1000 }],
      };
      const after = drainEnergyNode(world, { x: 1, y: 1 }, 200);
      expect(after.energyNodes[0].stored).toBe(300);
    });
  });

  describe('Remains', () => {
    it('creates and finds adjacent remains', () => {
      const remains = createRemains({ x: 3, y: 3 }, ['Frame'], { Ore: 2 });
      let world = addRemains(emptyWorld(), remains);
      expect(findAdjacentRemains(world, { x: 3, y: 4 })).toBeDefined();
      expect(findAdjacentRemains(world, { x: 5, y: 5 })).toBeUndefined();
    });

    it('updateRemains removes empty remains', () => {
      const remains = createRemains({ x: 1, y: 1 }, [], {});
      let world = addRemains(emptyWorld(), remains);
      world = updateRemains(world, remains, null);
      expect(world.remains.length).toBe(0);
    });
  });

  describe('tile occupation', () => {
    it('ResourceNode occupies tile', () => {
      const world: World = {
        ...emptyWorld(),
        resourceNodes: [{ position: { x: 2, y: 2 }, type: 'OreNode', remaining: 5 }],
      };
      expect(isOccupied(world, { x: 2, y: 2 })).toBe(true);
      expect(isOccupied(world, { x: 3, y: 3 })).toBe(false);
    });

    it('EnergyNode occupies tile', () => {
      const world: World = {
        ...emptyWorld(),
        energyNodes: [{ position: { x: 4, y: 4 }, productionRate: 100, stored: 500, maxStored: 1000 }],
      };
      expect(isOccupied(world, { x: 4, y: 4 })).toBe(true);
    });

    it('Remains occupies tile', () => {
      const remains = createRemains({ x: 5, y: 5 }, ['Frame'], {});
      const world = addRemains(emptyWorld(), remains);
      expect(isOccupied(world, { x: 5, y: 5 })).toBe(true);
    });
  });
});
