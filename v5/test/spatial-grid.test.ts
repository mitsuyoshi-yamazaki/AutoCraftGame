import { describe, it, expect } from 'vitest';
import { buildGrid, queryRange } from '../src/spatial-grid.js';
import type { World, Character, ResourceNode, EnergyNode, Remains } from '../src/types.js';
import { createGroundGrid } from '../src/ground.js';

function createMinimalWorld(overrides: Partial<World> = {}): World {
  return {
    width: 20,
    height: 20,
    resourceNodes: [],
    energyNodes: [],
    remains: [],
    characters: [],
    groundGrid: createGroundGrid(20, 20),
    nextCharacterId: 1,
    nextObjectId: 1,
    tick: 0,
    ...overrides,
  };
}

function makeCharacter(id: string, x: number, y: number): Character {
  return {
    id,
    species: 'test',
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    components: ['Frame', 'MemoryCore'],
    inventory: {},
    durability: 300,
    energy: 500,
    createdAt: 0,
    vm: {
      memory: [],
      registers: [0, 0, 0, 0, 0, 0, 0, 0],
      pc: 0,
      active: true,
      localIdTable: new Map(),
      localIdCounter: 0,
    },
  };
}

function makeResourceNode(id: string, x: number, y: number): ResourceNode {
  return {
    id,
    position: { x, y },
    type: 'OreNode',
    remaining: 10,
    createdAt: 0,
  };
}

function makeEnergyNode(id: string, x: number, y: number): EnergyNode {
  return {
    id,
    position: { x, y },
    productionRate: 100,
    stored: 500,
    maxStored: 1600,
    createdAt: 0,
  };
}

function makeRemains(id: string, x: number, y: number): Remains {
  return {
    id,
    position: { x, y },
    components: ['Frame'],
    inventory: {},
    createdAt: 0,
  };
}

describe('buildGrid', () => {
  it('creates a grid with correct dimensions', () => {
    const world = createMinimalWorld();
    const grid = buildGrid(world, 5);
    expect(grid.cellSize).toBe(5);
    expect(grid.cols).toBe(4); // ceil(20/5) = 4
    expect(grid.rows).toBe(4);
    expect(grid.cells.length).toBe(16);
  });

  it('places characters into correct cells', () => {
    const ch = makeCharacter('c-001', 2, 3);
    const world = createMinimalWorld({ characters: [ch] });
    const grid = buildGrid(world, 5);
    // Position (2,3) => col=0, row=0 => cell index 0
    const allEntries = grid.cells.flat();
    expect(allEntries.length).toBe(1);
    expect(allEntries[0].id).toBe('c-001');
    expect(allEntries[0].kind).toBe('character');
  });

  it('places all object types into the grid', () => {
    const world = createMinimalWorld({
      characters: [makeCharacter('c-001', 2, 2)],
      resourceNodes: [makeResourceNode('n-001', 7, 7)],
      energyNodes: [makeEnergyNode('e-001', 12, 12)],
      remains: [makeRemains('r-001', 17, 17)],
    });
    const grid = buildGrid(world, 5);
    const allEntries = grid.cells.flat();
    expect(allEntries.length).toBe(4);

    const kinds = allEntries.map((e) => e.kind).sort();
    expect(kinds).toEqual(['character', 'energyNode', 'remains', 'resourceNode']);
  });

  it('handles multiple objects in the same cell', () => {
    const world = createMinimalWorld({
      characters: [
        makeCharacter('c-001', 1, 1),
        makeCharacter('c-002', 2, 2),
      ],
    });
    const grid = buildGrid(world, 5);
    // Both in cell (0,0) since positions (1,1) and (2,2) are in same 5x5 cell
    const cell = grid.cells[0]; // row=0, col=0
    expect(cell.length).toBe(2);
  });
});

describe('queryRange', () => {
  it('returns entries within query range', () => {
    const world = createMinimalWorld({
      characters: [
        makeCharacter('c-001', 5, 5),
        makeCharacter('c-002', 15, 15),
      ],
    });
    const grid = buildGrid(world, 5);
    const results = queryRange(grid, { x: 5, y: 5 }, 3);
    const ids = results.map((e) => e.id);
    expect(ids).toContain('c-001');
    expect(ids).not.toContain('c-002');
  });

  it('returns all entries when range covers entire grid', () => {
    const world = createMinimalWorld({
      characters: [
        makeCharacter('c-001', 2, 2),
        makeCharacter('c-002', 18, 18),
      ],
      resourceNodes: [makeResourceNode('n-001', 10, 10)],
    });
    const grid = buildGrid(world, 5);
    const results = queryRange(grid, { x: 10, y: 10 }, 20);
    expect(results.length).toBe(3);
  });

  it('returns empty array when no entries are in range', () => {
    const world = createMinimalWorld({
      characters: [makeCharacter('c-001', 18, 18)],
    });
    const grid = buildGrid(world, 5);
    const results = queryRange(grid, { x: 2, y: 2 }, 1);
    expect(results.length).toBe(0);
  });

  it('returns entries from multiple cells when range spans cells', () => {
    const world = createMinimalWorld({
      characters: [
        makeCharacter('c-001', 4, 4),  // cell (0,0)
        makeCharacter('c-002', 6, 6),  // cell (1,1)
      ],
    });
    const grid = buildGrid(world, 5);
    // Query centered at (5,5) with range 2 should span cells (0,0), (0,1), (1,0), (1,1)
    const results = queryRange(grid, { x: 5, y: 5 }, 2);
    expect(results.length).toBe(2);
  });

  it('handles empty world', () => {
    const world = createMinimalWorld();
    const grid = buildGrid(world, 5);
    const results = queryRange(grid, { x: 10, y: 10 }, 5);
    expect(results.length).toBe(0);
  });
});
