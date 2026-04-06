import { describe, it, expect } from 'vitest';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { World, Remains, GroundGrid, ComponentType } from '../src/types.js';
import {
  createGroundGrid,
  positionToCell,
  addToGround,
  absorbRemains,
  getMooreSum,
  regenerateNodes,
  computeSpillage,
} from '../src/ground.js';

const params = DEFAULT_GAME_PARAMS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeWorld(overrides: Partial<World> = {}): World {
  const width = overrides.width ?? 10;
  const height = overrides.height ?? 10;
  return {
    width,
    height,
    resourceNodes: [],
    energyNodes: [],
    remains: [],
    characters: [],
    groundGrid: createGroundGrid(width, height),
    nextCharacterId: 1,
    nextObjectId: 1,
    tick: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createGroundGrid
// ---------------------------------------------------------------------------
describe('createGroundGrid', () => {
  it('creates a grid of the correct size with all zeros', () => {
    const grid = createGroundGrid(5, 4);
    expect(grid.length).toBe(20);
    for (const cell of grid) {
      expect(cell.ore).toBe(0);
      expect(cell.crystal).toBe(0);
    }
  });

  it('creates a 1x1 grid', () => {
    const grid = createGroundGrid(1, 1);
    expect(grid.length).toBe(1);
    expect(grid[0]).toEqual({ ore: 0, crystal: 0 });
  });
});

// ---------------------------------------------------------------------------
// positionToCell
// ---------------------------------------------------------------------------
describe('positionToCell', () => {
  it('maps a position to the correct cell coordinates', () => {
    const result = positionToCell({ x: 2.5, y: 3.7 }, 10, 10);
    expect(result.cellX).toBe(2);
    expect(result.cellY).toBe(3);
  });

  it('clamps to the grid boundary when position equals width/height', () => {
    const result = positionToCell({ x: 10, y: 10 }, 10, 10);
    expect(result.cellX).toBe(9);
    expect(result.cellY).toBe(9);
  });

  it('maps origin to cell (0, 0)', () => {
    const result = positionToCell({ x: 0.1, y: 0.1 }, 10, 10);
    expect(result.cellX).toBe(0);
    expect(result.cellY).toBe(0);
  });

  it('maps position just below boundary', () => {
    const result = positionToCell({ x: 4.99, y: 7.01 }, 10, 10);
    expect(result.cellX).toBe(4);
    expect(result.cellY).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// addToGround
// ---------------------------------------------------------------------------
describe('addToGround', () => {
  it('adds ore and crystal to the correct cell', () => {
    const grid = createGroundGrid(5, 5);
    const result = addToGround(grid, 5, 5, { x: 2.5, y: 3.5 }, 10, 20);

    // Cell (2, 3) => index = 3 * 5 + 2 = 17
    expect(result[17].ore).toBe(10);
    expect(result[17].crystal).toBe(20);
    // Other cells remain zero
    expect(result[0].ore).toBe(0);
    expect(result[0].crystal).toBe(0);
  });

  it('accumulates materials when called multiple times', () => {
    const grid = createGroundGrid(3, 3);
    const pos = { x: 1.5, y: 1.5 };
    const r1 = addToGround(grid, 3, 3, pos, 5, 3);
    const r2 = addToGround(r1, 3, 3, pos, 7, 2);

    // Cell (1, 1) => index = 1 * 3 + 1 = 4
    expect(r2[4].ore).toBe(12);
    expect(r2[4].crystal).toBe(5);
  });

  it('returns a new grid without mutating the original', () => {
    const grid = createGroundGrid(3, 3);
    const result = addToGround(grid, 3, 3, { x: 0.5, y: 0.5 }, 10, 0);
    expect(grid[0].ore).toBe(0);
    expect(result[0].ore).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// absorbRemains
// ---------------------------------------------------------------------------
describe('absorbRemains', () => {
  it('converts components and inventory to raw materials on ground', () => {
    const remains: Remains = {
      id: 'r1',
      position: { x: 1.5, y: 1.5 },
      components: ['Frame'],   // Frame = Metal*3 => Ore*2 per Metal => 6 ore
      inventory: {},
      createdAt: 0,
    };
    const grid = createGroundGrid(5, 5);
    const result = absorbRemains(grid, 5, 5, remains, params);

    // Frame recipe: Metal: 3 => each Metal = Ore: 2 => total ore = 6
    // Cell (1, 1) => index = 1 * 5 + 1 = 6
    expect(result[6].ore).toBe(6);
    expect(result[6].crystal).toBe(0);
  });

  it('converts inventory raw materials to ground', () => {
    const remains: Remains = {
      id: 'r1',
      position: { x: 0.5, y: 0.5 },
      components: [],
      inventory: { Ore: 5, Crystal: 3 },
      createdAt: 0,
    };
    const grid = createGroundGrid(5, 5);
    const result = absorbRemains(grid, 5, 5, remains, params);

    expect(result[0].ore).toBe(5);
    expect(result[0].crystal).toBe(3);
  });

  it('converts processed materials (Metal, Circuit) back to raw', () => {
    const remains: Remains = {
      id: 'r1',
      position: { x: 0.5, y: 0.5 },
      components: [],
      inventory: { Metal: 2, Circuit: 1 },
      createdAt: 0,
    };
    const grid = createGroundGrid(5, 5);
    const result = absorbRemains(grid, 5, 5, remains, params);

    // Metal = Ore: 2 per unit => 2 Metal = 4 Ore
    // Circuit = Crystal: 2 per unit => 1 Circuit = 2 Crystal
    expect(result[0].ore).toBe(4);
    expect(result[0].crystal).toBe(2);
  });

  it('returns unchanged grid for empty remains', () => {
    const remains: Remains = {
      id: 'r1',
      position: { x: 0.5, y: 0.5 },
      components: [],
      inventory: {},
      createdAt: 0,
    };
    const grid = createGroundGrid(5, 5);
    const result = absorbRemains(grid, 5, 5, remains, params);

    // Should be the same reference since totalOre and totalCrystal are 0
    expect(result).toBe(grid);
  });

  it('handles components with crystal-based recipes', () => {
    const remains: Remains = {
      id: 'r1',
      position: { x: 0.5, y: 0.5 },
      components: ['Sensor'],   // Sensor = Circuit: 2 => Crystal: 2 each => 4 crystal
      inventory: {},
      createdAt: 0,
    };
    const grid = createGroundGrid(5, 5);
    const result = absorbRemains(grid, 5, 5, remains, params);

    expect(result[0].ore).toBe(0);
    expect(result[0].crystal).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// getMooreSum
// ---------------------------------------------------------------------------
describe('getMooreSum', () => {
  it('sums all 9 cells in a 3x3 neighborhood (interior)', () => {
    // 3x3 grid, set every cell to ore=1, crystal=2
    const grid: GroundGrid = Array.from({ length: 9 }, () => ({ ore: 1, crystal: 2 }));
    const sum = getMooreSum(grid, 3, 3, 1, 1);

    // Center cell at (1,1) has all 9 neighbors (including itself)
    expect(sum.ore).toBe(9);
    expect(sum.crystal).toBe(18);
  });

  it('sums only 4 cells at a corner', () => {
    const grid: GroundGrid = Array.from({ length: 9 }, () => ({ ore: 1, crystal: 0 }));
    const sum = getMooreSum(grid, 3, 3, 0, 0);

    // Corner (0,0) has neighbors: (0,0),(1,0),(0,1),(1,1) => 4 cells
    expect(sum.ore).toBe(4);
  });

  it('sums only 6 cells at an edge (non-corner)', () => {
    const grid: GroundGrid = Array.from({ length: 9 }, () => ({ ore: 1, crystal: 0 }));
    const sum = getMooreSum(grid, 3, 3, 1, 0);

    // Edge cell (1,0) top edge has: (0,0),(1,0),(2,0),(0,1),(1,1),(2,1) => 6 cells
    expect(sum.ore).toBe(6);
  });

  it('returns zero for a grid of all zeros', () => {
    const grid = createGroundGrid(5, 5);
    const sum = getMooreSum(grid, 5, 5, 2, 2);
    expect(sum.ore).toBe(0);
    expect(sum.crystal).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// regenerateNodes
// ---------------------------------------------------------------------------
describe('regenerateNodes', () => {
  it('spawns an OreNode when ore in Moore neighborhood reaches threshold', () => {
    const threshold = params.nodeRegenerationThreshold; // 50
    let world = makeWorld({ width: 5, height: 5 });

    // Place enough ore at cell (1,1). The raster scan at (0,0) includes (1,1) in
    // its Moore neighborhood, so the node spawns at cx=0.
    let grid = world.groundGrid;
    grid = addToGround(grid, 5, 5, { x: 1.5, y: 1.5 }, threshold, 0);
    world = { ...world, groundGrid: grid };

    const result = regenerateNodes(world, params);

    expect(result.resourceNodes.length).toBe(1);
    expect(result.resourceNodes[0].type).toBe('OreNode');
    expect(result.resourceNodes[0].remaining).toBe(threshold);
    // Raster scan finds it at (0,0): position = (0+0.5+0.2, 0+0.5) = (0.7, 0.5)
    expect(result.resourceNodes[0].position.x).toBeCloseTo(0.7);
    expect(result.resourceNodes[0].position.y).toBeCloseTo(0.5);
  });

  it('spawns a CrystalNode when crystal in Moore neighborhood reaches threshold', () => {
    const threshold = params.nodeRegenerationThreshold;
    let world = makeWorld({ width: 5, height: 5 });

    // Place crystal at cell (2,2). Raster scan at (1,1) includes (2,2) via Moore.
    let grid = world.groundGrid;
    grid = addToGround(grid, 5, 5, { x: 2.5, y: 2.5 }, 0, threshold);
    world = { ...world, groundGrid: grid };

    const result = regenerateNodes(world, params);

    expect(result.resourceNodes.length).toBe(1);
    expect(result.resourceNodes[0].type).toBe('CrystalNode');
    expect(result.resourceNodes[0].remaining).toBe(threshold);
    // Raster scan finds it at (1,1): position = (1+0.5, 1+0.5+0.2) = (1.5, 1.7)
    expect(result.resourceNodes[0].position.x).toBeCloseTo(1.5);
    expect(result.resourceNodes[0].position.y).toBeCloseTo(1.7);
  });

  it('does not spawn nodes when below threshold', () => {
    const belowThreshold = params.nodeRegenerationThreshold - 1;
    let world = makeWorld({ width: 5, height: 5 });

    let grid = world.groundGrid;
    grid = addToGround(grid, 5, 5, { x: 1.5, y: 1.5 }, belowThreshold, belowThreshold);
    world = { ...world, groundGrid: grid };

    const result = regenerateNodes(world, params);

    expect(result.resourceNodes.length).toBe(0);
  });

  it('clears the ground materials after spawning a node', () => {
    const threshold = params.nodeRegenerationThreshold;
    let world = makeWorld({ width: 5, height: 5 });

    let grid = world.groundGrid;
    grid = addToGround(grid, 5, 5, { x: 1.5, y: 1.5 }, threshold, 0);
    world = { ...world, groundGrid: grid };

    const result = regenerateNodes(world, params);

    // After spawning, the Moore neighborhood ore should be cleared
    const sum = getMooreSum(result.groundGrid, 5, 5, 1, 1);
    expect(sum.ore).toBe(0);
  });

  it('can spawn both ore and crystal nodes from different regions', () => {
    const threshold = params.nodeRegenerationThreshold;
    let world = makeWorld({ width: 10, height: 10 });

    let grid = world.groundGrid;
    // Ore at (1,1)
    grid = addToGround(grid, 10, 10, { x: 1.5, y: 1.5 }, threshold, 0);
    // Crystal at (8,8)
    grid = addToGround(grid, 10, 10, { x: 8.5, y: 8.5 }, 0, threshold);
    world = { ...world, groundGrid: grid };

    const result = regenerateNodes(world, params);

    const oreNodes = result.resourceNodes.filter(n => n.type === 'OreNode');
    const crystalNodes = result.resourceNodes.filter(n => n.type === 'CrystalNode');
    expect(oreNodes.length).toBe(1);
    expect(crystalNodes.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeSpillage
// ---------------------------------------------------------------------------
describe('computeSpillage', () => {
  it('returns ore spillage for Frame (Metal-based spillage)', () => {
    // Frame spillage: { Metal: 1 } => Metal = Ore: 2
    const spill = computeSpillage('Frame', params);
    expect(spill.ore).toBe(2);
    expect(spill.crystal).toBe(0);
  });

  it('returns crystal spillage for Sensor (Circuit-based spillage)', () => {
    // Sensor spillage: { Circuit: 1 } => Circuit = Crystal: 2
    const spill = computeSpillage('Sensor', params);
    expect(spill.ore).toBe(0);
    expect(spill.crystal).toBe(2);
  });

  it('returns crystal spillage for Processor', () => {
    // Processor spillage: { Circuit: 1 } => Crystal: 2
    const spill = computeSpillage('Processor', params);
    expect(spill.ore).toBe(0);
    expect(spill.crystal).toBe(2);
  });

  it('returns ore spillage for Actuator', () => {
    // Actuator spillage: { Metal: 1 } => Ore: 2
    const spill = computeSpillage('Actuator', params);
    expect(spill.ore).toBe(2);
    expect(spill.crystal).toBe(0);
  });

  it('returns zero for an unknown component', () => {
    const spill = computeSpillage('UnknownThing', params);
    expect(spill.ore).toBe(0);
    expect(spill.crystal).toBe(0);
  });

  it('returns ore spillage for Assembler', () => {
    // Assembler spillage: { Metal: 1 } => Ore: 2
    const spill = computeSpillage('Assembler', params);
    expect(spill.ore).toBe(2);
    expect(spill.crystal).toBe(0);
  });

  it('returns crystal spillage for Charger', () => {
    // Charger spillage: { Circuit: 1 } => Crystal: 2
    const spill = computeSpillage('Charger', params);
    expect(spill.ore).toBe(0);
    expect(spill.crystal).toBe(2);
  });
});
