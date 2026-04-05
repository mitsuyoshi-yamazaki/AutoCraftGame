import { describe, it, expect } from 'vitest';
import type { Character, Remains, World } from '../src/types.js';
import {
  createGroundGrid,
  groundGridDimensions,
  positionToCell,
  addToGround,
  absorbRemains,
  getMooreSum,
  regenerateNodes,
  absorbOldRemains,
  computeSpillage,
  itemToRaw,
} from '../src/ground.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createActionEngine } from '../src/actions.js';
import { createRecipeEngine } from '../src/recipes.js';
import { createWorldEngine } from '../src/world.js';
import { createCharacterEngine } from '../src/character.js';
import { createProgramEngine } from '../src/program.js';

const params = DEFAULT_GAME_PARAMS;

function makeWorld(overrides: Partial<World> = {}): World {
  const width = overrides.width ?? 10;
  const height = overrides.height ?? 10;
  const { gridWidth, gridHeight } = groundGridDimensions({ width, height });
  return {
    width,
    height,
    resourceNodes: [],
    energyNodes: [],
    remains: [],
    characters: [],
    groundGrid: createGroundGrid(gridWidth, gridHeight),
    nextCharacterId: 1,
    nextObjectId: 1,
    tick: 0,
    ...overrides,
  };
}

function makeRemains(x: number, y: number, overrides: Partial<Remains> = {}): Remains {
  return {
    id: 'rem-1',
    position: { x, y },
    components: [],
    inventory: {},
    createdAt: 0,
    ...overrides,
  };
}

describe('ground', () => {
  describe('createGroundGrid', () => {
    it('creates grid with correct size', () => {
      const grid = createGroundGrid(3, 4);
      expect(grid).toHaveLength(12);
      expect(grid.every((c) => c.ore === 0 && c.crystal === 0)).toBe(true);
    });
  });

  describe('positionToCell', () => {
    it('maps position to cell coordinates', () => {
      expect(positionToCell({ x: 5.7, y: 3.2 }, 10, 10)).toEqual({ cellX: 5, cellY: 3 });
    });

    it('clamps to grid bounds', () => {
      expect(positionToCell({ x: 10.0, y: 10.0 }, 10, 10)).toEqual({ cellX: 9, cellY: 9 });
    });
  });

  describe('addToGround', () => {
    it('adds materials to correct cell', () => {
      const grid = createGroundGrid(5, 5);
      const updated = addToGround(grid, 5, 5, { x: 2.5, y: 3.1 }, 10, 5);
      // cellX=2, cellY=3 → index = 3*5 + 2 = 17
      expect(updated[17]).toEqual({ ore: 10, crystal: 5 });
      // Other cells unchanged
      expect(updated[0]).toEqual({ ore: 0, crystal: 0 });
    });
  });

  describe('itemToRaw', () => {
    it('converts Ore to ore', () => {
      expect(itemToRaw('Ore', 3, params)).toEqual({ ore: 3, crystal: 0 });
    });

    it('converts Crystal to crystal', () => {
      expect(itemToRaw('Crystal', 2, params)).toEqual({ ore: 0, crystal: 2 });
    });

    it('converts Metal to ore (×2 per Metal)', () => {
      expect(itemToRaw('Metal', 1, params)).toEqual({ ore: 2, crystal: 0 });
    });

    it('converts Circuit to crystal (×2 per Circuit)', () => {
      expect(itemToRaw('Circuit', 1, params)).toEqual({ ore: 0, crystal: 2 });
    });

    it('converts Frame to ore (Metal×3 = Ore×6)', () => {
      expect(itemToRaw('Frame', 1, params)).toEqual({ ore: 6, crystal: 0 });
    });

    it('converts Actuator (Metal×1+Circuit×1 = Ore×2+Crystal×2)', () => {
      expect(itemToRaw('Actuator', 1, params)).toEqual({ ore: 2, crystal: 2 });
    });
  });

  describe('absorbRemains', () => {
    it('converts inventory items to ground materials', () => {
      const grid = createGroundGrid(10, 10);
      const remains = makeRemains(5.5, 5.5, {
        inventory: { Ore: 3, Crystal: 2, Metal: 1 },
      });
      const updated = absorbRemains(grid, 10, 10, remains, params);
      // cellX=5, cellY=5 → index = 55
      // Ore:3 → ore+=3, Crystal:2 → crystal+=2, Metal:1 → ore+=2
      expect(updated[55]).toEqual({ ore: 5, crystal: 2 });
    });

    it('converts components to ground materials', () => {
      const grid = createGroundGrid(10, 10);
      const remains = makeRemains(2.5, 2.5, {
        components: ['Frame', 'Sensor'],
      });
      const updated = absorbRemains(grid, 10, 10, remains, params);
      // Frame = Metal×3 = Ore×6, Sensor = Circuit×2 = Crystal×4
      // cellX=2, cellY=2 → index = 22
      expect(updated[22]).toEqual({ ore: 6, crystal: 4 });
    });
  });

  describe('getMooreSum', () => {
    it('sums 3×3 neighborhood', () => {
      let grid = createGroundGrid(5, 5);
      // Set some values in the neighborhood of (2,2)
      grid = addToGround(grid, 5, 5, { x: 1.5, y: 1.5 }, 10, 0); // (1,1)
      grid = addToGround(grid, 5, 5, { x: 2.5, y: 2.5 }, 20, 5); // (2,2)
      grid = addToGround(grid, 5, 5, { x: 3.5, y: 3.5 }, 15, 3); // (3,3)
      const sum = getMooreSum(grid, 5, 5, 2, 2);
      expect(sum.ore).toBe(45);
      expect(sum.crystal).toBe(8);
    });

    it('handles corner cell (0,0) with fewer neighbors', () => {
      let grid = createGroundGrid(5, 5);
      grid = addToGround(grid, 5, 5, { x: 0.5, y: 0.5 }, 10, 0); // (0,0)
      grid = addToGround(grid, 5, 5, { x: 1.5, y: 0.5 }, 5, 0);  // (1,0)
      grid = addToGround(grid, 5, 5, { x: 0.5, y: 1.5 }, 3, 0);  // (0,1)
      grid = addToGround(grid, 5, 5, { x: 1.5, y: 1.5 }, 2, 0);  // (1,1)
      const sum = getMooreSum(grid, 5, 5, 0, 0);
      expect(sum.ore).toBe(20); // 10+5+3+2
    });
  });

  describe('regenerateNodes', () => {
    it('spawns OreNode when ore threshold reached', () => {
      let world = makeWorld({ width: 5, height: 5 });
      // Put 80 ore at cell (2,2). Raster scan hits cell (1,1) first
      // because (1,1)'s Moore neighborhood includes (2,2).
      let grid = world.groundGrid;
      grid = addToGround(grid, 5, 5, { x: 2.5, y: 2.5 }, 80, 0);
      world = { ...world, groundGrid: grid };

      const result = regenerateNodes(world, params);
      expect(result.resourceNodes).toHaveLength(1);
      const node = result.resourceNodes[0];
      expect(node.type).toBe('OreNode');
      expect(node.remaining).toBe(80);
      // Node spawns at evaluated cell (1,1) center + offset
      expect(node.position.x).toBeCloseTo(1.7); // 1 + 0.5 + 0.2
      expect(node.position.y).toBeCloseTo(1.5); // 1 + 0.5

      // Ground grid should be cleared in (1,1)'s Moore neighborhood
      const sum = getMooreSum(result.groundGrid, 5, 5, 1, 1);
      expect(sum.ore).toBe(0);
    });

    it('spawns CrystalNode when crystal threshold reached', () => {
      let world = makeWorld({ width: 5, height: 5 });
      let grid = world.groundGrid;
      grid = addToGround(grid, 5, 5, { x: 2.5, y: 2.5 }, 0, 90);
      world = { ...world, groundGrid: grid };

      const result = regenerateNodes(world, params);
      expect(result.resourceNodes).toHaveLength(1);
      const node = result.resourceNodes[0];
      expect(node.type).toBe('CrystalNode');
      expect(node.remaining).toBe(90);
      expect(node.position.x).toBeCloseTo(1.5); // 1 + 0.5
      expect(node.position.y).toBeCloseTo(1.7); // 1 + 0.5 + 0.2
    });

    it('spawns both OreNode and CrystalNode when both thresholds reached', () => {
      let world = makeWorld({ width: 5, height: 5 });
      let grid = world.groundGrid;
      grid = addToGround(grid, 5, 5, { x: 2.5, y: 2.5 }, 100, 85);
      world = { ...world, groundGrid: grid };

      const result = regenerateNodes(world, params);
      expect(result.resourceNodes).toHaveLength(2);
      expect(result.resourceNodes[0].type).toBe('OreNode');
      expect(result.resourceNodes[1].type).toBe('CrystalNode');
    });

    it('does not spawn when below threshold', () => {
      let world = makeWorld({ width: 5, height: 5 });
      let grid = world.groundGrid;
      // Below threshold (50): 49 should not trigger
      grid = addToGround(grid, 5, 5, { x: 2.5, y: 2.5 }, 49, 0);
      world = { ...world, groundGrid: grid };

      const result = regenerateNodes(world, params);
      expect(result.resourceNodes).toHaveLength(0);
    });

    it('clears only the regenerated resource from 9 cells', () => {
      let world = makeWorld({ width: 5, height: 5 });
      let grid = world.groundGrid;
      // Both ore and crystal, but only ore reaches threshold (50)
      grid = addToGround(grid, 5, 5, { x: 2.5, y: 2.5 }, 50, 30);
      world = { ...world, groundGrid: grid };

      const result = regenerateNodes(world, params);
      expect(result.resourceNodes).toHaveLength(1);
      expect(result.resourceNodes[0].type).toBe('OreNode');
      // Crystal (30) is below threshold, should still be in grid
      const cell22 = result.groundGrid[2 * 5 + 2];
      expect(cell22.ore).toBe(0);
      expect(cell22.crystal).toBe(30);
    });
  });

  describe('absorbOldRemains', () => {
    it('absorbs remains older than threshold', () => {
      const remains = makeRemains(5.5, 5.5, {
        inventory: { Ore: 10 },
        createdAt: 0,
      });
      // absorptionTicks=600, so tick 600 should absorb remains from tick 0
      const world = makeWorld({ tick: 600, remains: [remains] });

      const result = absorbOldRemains(world, params);
      expect(result.remains).toHaveLength(0);
      // ore should be in ground at cell (5,5)
      const { gridWidth, gridHeight } = groundGridDimensions(world);
      const sum = getMooreSum(result.groundGrid, gridWidth, gridHeight, 5, 5);
      expect(sum.ore).toBe(10);
    });

    it('keeps remains younger than threshold', () => {
      const remains = makeRemains(5.5, 5.5, {
        inventory: { Ore: 10 },
        createdAt: 100,
      });
      // tick 600, createdAt 100 → age=500 < 600 → kept
      const world = makeWorld({ tick: 600, remains: [remains] });

      const result = absorbOldRemains(world, params);
      expect(result.remains).toHaveLength(1);
    });
  });

  describe('computeSpillage', () => {
    it('returns spillage for Frame (Metal×1 → Ore×2)', () => {
      expect(computeSpillage('Frame', params)).toEqual({ ore: 2, crystal: 0 });
    });

    it('returns spillage for Sensor (Circuit×1 → Crystal×2)', () => {
      expect(computeSpillage('Sensor', params)).toEqual({ ore: 0, crystal: 2 });
    });

    it('returns no spillage for Register', () => {
      expect(computeSpillage('Register', params)).toEqual({ ore: 0, crystal: 0 });
    });
  });

  describe('DISASSEMBLE spillage integration', () => {
    const recipeEngine = createRecipeEngine(params);
    const worldEngine = createWorldEngine(params);
    const characterEngine = createCharacterEngine(params);
    const programEngine = createProgramEngine(params);
    const actionEngine = createActionEngine(params, { recipeEngine, worldEngine, characterEngine, programEngine });

    function makeDisassemblerChar(x: number, y: number): Character {
      return {
        id: 'c1',
        species: 'test',
        position: { x, y },
        velocity: { vx: 0, vy: 0 },
        components: ['Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'Charger', 'MemoryCore', 'Disassembler'],
        inventory: {},
        durability: 300,
        energy: 5000,
        program: { name: 'test', rules: [] },
        senseData: null,
        registers: [],
      };
    }

    it('spills material when disassembling component from remains.components', () => {
      const char = makeDisassemblerChar(5, 5);
      const remains = makeRemains(5.5, 5.5, {
        id: 'rem-1',
        components: ['Frame'],
        createdAt: 0,
      });
      const world = makeWorld({ width: 10, height: 10, characters: [char], remains: [remains], nextObjectId: 100 });

      const result = actionEngine.executeAction(world, 'c1', { op: 'DISASSEMBLE' });
      const updatedChar = result.world.characters.find((c) => c.id === 'c1')!;

      // Frame recipe = Metal×3, spillage = Metal×1, net = Metal×2
      expect(updatedChar.inventory).toEqual({ Metal: 2 });

      // Ground should have spillage: Metal×1 → Ore×2
      const { gridWidth, gridHeight } = groundGridDimensions(result.world);
      const sum = getMooreSum(result.world.groundGrid, gridWidth, gridHeight, 5, 5);
      expect(sum.ore).toBe(2);
    });

    it('spills material when disassembling component from remains.inventory', () => {
      const char = makeDisassemblerChar(5, 5);
      const remains = makeRemains(5.5, 5.5, {
        id: 'rem-1',
        inventory: { Sensor: 1 },
        createdAt: 0,
      });
      const world = makeWorld({ width: 10, height: 10, characters: [char], remains: [remains], nextObjectId: 100 });

      const result = actionEngine.executeAction(world, 'c1', { op: 'DISASSEMBLE' });
      const updatedChar = result.world.characters.find((c) => c.id === 'c1')!;

      // Sensor recipe = Circuit×2, spillage = Circuit×1, net = Circuit×1
      expect(updatedChar.inventory).toEqual({ Circuit: 1 });

      // Ground should have spillage: Circuit×1 → Crystal×2
      const { gridWidth, gridHeight } = groundGridDimensions(result.world);
      const sum = getMooreSum(result.world.groundGrid, gridWidth, gridHeight, 5, 5);
      expect(sum.crystal).toBe(2);
    });

    it('does not spill when disassembling raw materials', () => {
      const char = makeDisassemblerChar(5, 5);
      const remains = makeRemains(5.5, 5.5, {
        id: 'rem-1',
        inventory: { Ore: 3 },
        createdAt: 0,
      });
      const world = makeWorld({ width: 10, height: 10, characters: [char], remains: [remains], nextObjectId: 100 });

      const result = actionEngine.executeAction(world, 'c1', { op: 'DISASSEMBLE' });
      const updatedChar = result.world.characters.find((c) => c.id === 'c1')!;

      expect(updatedChar.inventory).toEqual({ Ore: 1 });

      // No spillage for raw materials
      const { gridWidth, gridHeight } = groundGridDimensions(result.world);
      const sum = getMooreSum(result.world.groundGrid, gridWidth, gridHeight, 5, 5);
      expect(sum.ore).toBe(0);
      expect(sum.crystal).toBe(0);
    });
  });

  describe('material conservation', () => {
    it('total materials are conserved through absorption and regeneration cycle', () => {
      // Start with remains containing known materials
      const remains = makeRemains(5.5, 5.5, {
        components: ['Frame', 'Actuator'],
        inventory: { Ore: 3, Crystal: 2, Metal: 1 },
        createdAt: 0,
      });
      // Frame = Ore×6, Actuator = Ore×2 + Crystal×2, Metal = Ore×2
      // Total: Ore = 6+2+3+2 = 13, Crystal = 2+2 = 4
      let world = makeWorld({ tick: 600, remains: [remains] });

      // Step 1: Absorb remains (absorptionTicks=600, age=600 >= 600)
      world = absorbOldRemains(world, params);
      expect(world.remains).toHaveLength(0);

      // Verify total in ground
      const { gridWidth, gridHeight } = groundGridDimensions(world);
      const sum = getMooreSum(world.groundGrid, gridWidth, gridHeight, 5, 5);
      expect(sum.ore).toBe(13);
      expect(sum.crystal).toBe(4);
    });
  });
});
