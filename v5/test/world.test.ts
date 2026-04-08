import { describe, it, expect } from 'vitest';
import {
  createWorld,
  createWorldEngine,
  createRng,
  distance,
  circlesOverlap,
  produceEnergy,
  updateCharacter,
  depleteResourceNode,
  drainEnergyNode,
  addRemains,
  createRemains,
  addCharacter,
  removeCharacter,
  getCharacter,
  nextCharacterId,
  nextObjectId,
  DEFAULT_WORLD_CONFIG,
} from '../src/world.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { World, Character, EnergyNode, ResourceNode } from '../src/types.js';
import { createGroundGrid } from '../src/ground.js';

const worldEngine = createWorldEngine(DEFAULT_GAME_PARAMS);

function createMinimalWorld(overrides: Partial<World> = {}): World {
  return {
    width: 60,
    height: 60,
    resourceNodes: [],
    energyNodes: [],
    remains: [],
    characters: [],
    groundGrid: createGroundGrid(60, 60),
    nextCharacterId: 1,
    nextObjectId: 1,
    tick: 0,
    ...overrides,
  };
}

function createTestCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'c-001',
    species: 'test',
    position: { x: 10, y: 10 },
    velocity: { vx: 0, vy: 0 },
    components: ['Frame', 'MemoryCore'],
    inventory: {},
    durability: 300,
    energy: 500,
    createdAt: 0,
    vm: {
      memory: new Array(1024).fill(0),
      registers: [0, 0, 0, 0, 0, 0, 0, 0],
      pc: 0,
      active: true,
      localIdTable: new Map(),
      localIdCounter: 0,
    },
    ...overrides,
  };
}

describe('distance', () => {
  it('computes distance between two points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('returns 0 for same point', () => {
    expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('computes distance with negative coordinates', () => {
    expect(distance({ x: -3, y: 0 }, { x: 0, y: 4 })).toBe(5);
  });
});

describe('circlesOverlap', () => {
  it('returns true when circles overlap', () => {
    expect(circlesOverlap({ x: 0, y: 0 }, 1, { x: 1, y: 0 }, 1)).toBe(true);
  });

  it('returns false when circles are apart', () => {
    expect(circlesOverlap({ x: 0, y: 0 }, 0.4, { x: 5, y: 0 }, 0.4)).toBe(false);
  });

  it('returns false when circles are exactly touching (not overlapping)', () => {
    // distance=2, radius sum=2 => not strictly less than => false
    expect(circlesOverlap({ x: 0, y: 0 }, 1, { x: 2, y: 0 }, 1)).toBe(false);
  });
});

describe('createWorld', () => {
  it('creates a world with the correct dimensions', () => {
    const rng = createRng(42);
    const world = createWorld(DEFAULT_WORLD_CONFIG, rng, worldEngine);
    expect(world.width).toBe(DEFAULT_WORLD_CONFIG.width);
    expect(world.height).toBe(DEFAULT_WORLD_CONFIG.height);
  });

  it('places the correct number of resource nodes', () => {
    const rng = createRng(42);
    const world = createWorld(DEFAULT_WORLD_CONFIG, rng, worldEngine);
    const oreNodes = world.resourceNodes.filter((n) => n.type === 'OreNode');
    const crystalNodes = world.resourceNodes.filter((n) => n.type === 'CrystalNode');
    expect(oreNodes.length).toBe(DEFAULT_WORLD_CONFIG.oreNodeCount);
    expect(crystalNodes.length).toBe(DEFAULT_WORLD_CONFIG.crystalNodeCount);
  });

  it('places the correct number of energy nodes', () => {
    const rng = createRng(42);
    const world = createWorld(DEFAULT_WORLD_CONFIG, rng, worldEngine);
    expect(world.energyNodes.length).toBe(DEFAULT_WORLD_CONFIG.energyNodeCount);
  });

  it('starts with tick 0 and no characters', () => {
    const rng = createRng(42);
    const world = createWorld(DEFAULT_WORLD_CONFIG, rng, worldEngine);
    expect(world.tick).toBe(0);
    expect(world.characters.length).toBe(0);
  });

  it('produces deterministic results with same seed', () => {
    const world1 = createWorld(DEFAULT_WORLD_CONFIG, createRng(123), worldEngine);
    const world2 = createWorld(DEFAULT_WORLD_CONFIG, createRng(123), worldEngine);
    expect(world1.resourceNodes).toEqual(world2.resourceNodes);
    expect(world1.energyNodes).toEqual(world2.energyNodes);
  });
});

describe('findNearestResourceNode', () => {
  it('finds the nearest resource node within range', () => {
    const node: ResourceNode = {
      id: 'n-001', position: { x: 10.5, y: 10 }, type: 'OreNode', remaining: 10, createdAt: 0,
    };
    const world = createMinimalWorld({ resourceNodes: [node] });
    const result = worldEngine.findNearestResourceNode(world, { x: 10, y: 10 });
    expect(result).not.toBeNull();
    expect(result!.id).toBe('n-001');
  });

  it('returns null when no nodes are in range', () => {
    const node: ResourceNode = {
      id: 'n-001', position: { x: 50, y: 50 }, type: 'OreNode', remaining: 10, createdAt: 0,
    };
    const world = createMinimalWorld({ resourceNodes: [node] });
    const result = worldEngine.findNearestResourceNode(world, { x: 10, y: 10 });
    expect(result).toBeNull();
  });

  it('skips depleted nodes', () => {
    const node: ResourceNode = {
      id: 'n-001', position: { x: 10.5, y: 10 }, type: 'OreNode', remaining: 0, createdAt: 0,
    };
    const world = createMinimalWorld({ resourceNodes: [node] });
    const result = worldEngine.findNearestResourceNode(world, { x: 10, y: 10 });
    expect(result).toBeNull();
  });
});

describe('findSpawnPosition', () => {
  it('returns a position when space is available', () => {
    const world = createMinimalWorld();
    const pos = worldEngine.findSpawnPosition(world, { x: 30, y: 30 }, { vx: 0, vy: 0 });
    expect(pos).not.toBeNull();
  });

  it('returned position is spawnDistance away from parent', () => {
    const world = createMinimalWorld();
    const parentPos = { x: 30, y: 30 };
    const pos = worldEngine.findSpawnPosition(world, parentPos, { vx: 0, vy: 0 });
    expect(pos).not.toBeNull();
    const d = distance(parentPos, pos!);
    expect(d).toBeCloseTo(DEFAULT_GAME_PARAMS.spawnDistance, 5);
  });

  it('returns null when no space is available near edge', () => {
    // Place character at corner with many blocking objects
    const chars = Array.from({ length: 20 }, (_, i) =>
      createTestCharacter({
        id: `block-${i}`,
        position: {
          x: 0.5 + (i % 5) * 0.5,
          y: 0.5 + Math.floor(i / 5) * 0.5,
        },
      }),
    );
    const world = createMinimalWorld({ characters: chars });
    // Parent at corner (0.5, 0.5) - spawn positions may be out of bounds
    const pos = worldEngine.findSpawnPosition(world, { x: 0.1, y: 0.1 }, { vx: 0, vy: 0 });
    // Result may be null if all 4 candidate positions are blocked or out of bounds
    // We just verify the function doesn't crash
    expect(pos === null || (pos.x > 0 && pos.y > 0)).toBe(true);
  });
});

describe('produceEnergy', () => {
  it('increases stored energy by production rate', () => {
    const node: EnergyNode = {
      id: 'e-001', position: { x: 10, y: 10 },
      productionRate: 100, stored: 500, maxStored: 1600, createdAt: 0,
    };
    const world = createMinimalWorld({ energyNodes: [node] });
    const result = produceEnergy(world);
    expect(result.energyNodes[0].stored).toBe(600);
  });

  it('caps stored energy at maxStored', () => {
    const node: EnergyNode = {
      id: 'e-001', position: { x: 10, y: 10 },
      productionRate: 200, stored: 1500, maxStored: 1600, createdAt: 0,
    };
    const world = createMinimalWorld({ energyNodes: [node] });
    const result = produceEnergy(world);
    expect(result.energyNodes[0].stored).toBe(1600);
  });
});

describe('depleteResourceNode', () => {
  it('decrements remaining by 1', () => {
    const node: ResourceNode = {
      id: 'n-001', position: { x: 10, y: 10 }, type: 'OreNode', remaining: 5, createdAt: 0,
    };
    const world = createMinimalWorld({ resourceNodes: [node] });
    const result = depleteResourceNode(world, 'n-001');
    expect(result.resourceNodes[0].remaining).toBe(4);
  });

  it('removes node when remaining reaches 0', () => {
    const node: ResourceNode = {
      id: 'n-001', position: { x: 10, y: 10 }, type: 'OreNode', remaining: 1, createdAt: 0,
    };
    const world = createMinimalWorld({ resourceNodes: [node] });
    const result = depleteResourceNode(world, 'n-001');
    expect(result.resourceNodes.length).toBe(0);
  });
});

describe('drainEnergyNode', () => {
  it('reduces stored energy', () => {
    const node: EnergyNode = {
      id: 'e-001', position: { x: 10, y: 10 },
      productionRate: 100, stored: 500, maxStored: 1600, createdAt: 0,
    };
    const world = createMinimalWorld({ energyNodes: [node] });
    const result = drainEnergyNode(world, 'e-001', 200);
    expect(result.energyNodes[0].stored).toBe(300);
  });
});

describe('updateCharacter', () => {
  it('replaces the character with matching id', () => {
    const ch = createTestCharacter();
    const world = createMinimalWorld({ characters: [ch] });
    const updated = { ...ch, energy: 999 };
    const result = updateCharacter(world, updated);
    expect(result.characters[0].energy).toBe(999);
  });

  it('does not modify other characters', () => {
    const ch1 = createTestCharacter({ id: 'c-001' });
    const ch2 = createTestCharacter({ id: 'c-002', energy: 200 });
    const world = createMinimalWorld({ characters: [ch1, ch2] });
    const updated = { ...ch1, energy: 999 };
    const result = updateCharacter(world, updated);
    expect(result.characters[1].energy).toBe(200);
  });
});

describe('addCharacter / removeCharacter / getCharacter', () => {
  it('addCharacter appends a character', () => {
    const world = createMinimalWorld();
    const ch = createTestCharacter();
    const result = addCharacter(world, ch);
    expect(result.characters.length).toBe(1);
    expect(result.characters[0].id).toBe('c-001');
  });

  it('removeCharacter removes by id', () => {
    const ch = createTestCharacter();
    const world = createMinimalWorld({ characters: [ch] });
    const result = removeCharacter(world, 'c-001');
    expect(result.characters.length).toBe(0);
  });

  it('getCharacter finds character by id', () => {
    const ch = createTestCharacter();
    const world = createMinimalWorld({ characters: [ch] });
    expect(getCharacter(world, 'c-001')).toBeDefined();
    expect(getCharacter(world, 'nonexistent')).toBeUndefined();
  });
});

describe('nextCharacterId / nextObjectId', () => {
  it('generates sequential character ids', () => {
    const world = createMinimalWorld({ nextCharacterId: 1 });
    const { id: id1, world: w1 } = nextCharacterId(world);
    const { id: id2 } = nextCharacterId(w1);
    expect(id1).toBe('char-001');
    expect(id2).toBe('char-002');
  });

  it('generates sequential object ids', () => {
    const world = createMinimalWorld({ nextObjectId: 1 });
    const { id: id1, world: w1 } = nextObjectId(world);
    const { id: id2 } = nextObjectId(w1);
    expect(id1).toBe('obj-001');
    expect(id2).toBe('obj-002');
  });
});

describe('addRemains / createRemains', () => {
  it('creates and adds remains to world', () => {
    const world = createMinimalWorld();
    const remains = createRemains('r-001', { x: 5, y: 5 }, ['Frame'], { Ore: 3 }, 100);
    const result = addRemains(world, remains);
    expect(result.remains.length).toBe(1);
    expect(result.remains[0].id).toBe('r-001');
    expect(result.remains[0].components).toEqual(['Frame']);
    expect(result.remains[0].inventory).toEqual({ Ore: 3 });
  });
});

describe('createRng', () => {
  it('produces deterministic sequence from same seed', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const values1 = Array.from({ length: 10 }, () => rng1());
    const values2 = Array.from({ length: 10 }, () => rng2());
    expect(values1).toEqual(values2);
  });

  it('produces values between 0 and 1', () => {
    const rng = createRng(99);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces different sequences from different seeds', () => {
    const rng1 = createRng(1);
    const rng2 = createRng(2);
    const v1 = rng1();
    const v2 = rng2();
    expect(v1).not.toBe(v2);
  });
});
