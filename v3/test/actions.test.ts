import { describe, it, expect } from 'vitest';
import type { Character, World } from '../src/types.js';
import { createEngine } from '../src/engine.js';
import { createForceMap } from '../src/physics.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

const engine = createEngine(DEFAULT_GAME_PARAMS);
const { executeAction } = engine.simulation;

// Re-create the action engine's executeAction via the simulation engine is not directly exposed.
// Instead, use the engine's internal action engine. Let's access it through a dedicated test helper.
// Actually, looking at the engine, simulation.executeTick is exposed but not executeAction directly.
// We need to use createActionEngine directly for unit tests.

import { createActionEngine } from '../src/actions.js';
import { createRecipeEngine } from '../src/recipes.js';
import { createWorldEngine } from '../src/world.js';
import { createCharacterEngine } from '../src/character.js';
import { createProgramEngine } from '../src/program.js';

const recipeEngine = createRecipeEngine(DEFAULT_GAME_PARAMS);
const worldEngine = createWorldEngine(DEFAULT_GAME_PARAMS);
const characterEngine = createCharacterEngine(DEFAULT_GAME_PARAMS);
const programEngine = createProgramEngine(DEFAULT_GAME_PARAMS);
const actionEngine = createActionEngine(DEFAULT_GAME_PARAMS, { recipeEngine, worldEngine, characterEngine, programEngine });

function makeChar(id: string, x: number, y: number, energy = 5000): Character {
  return {
    id,
    species: 'test',
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    components: ['Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'Charger', 'MemoryCore', 'Register'],
    inventory: {},
    durability: 300,
    energy,
    program: { name: 'test', rules: [] },
    senseData: null,
    registers: [null, null, null, null],
  };
}

function makeWorld(chars: Character[]): World {
  return {
    width: 20,
    height: 20,
    resourceNodes: [
      { id: 'r1', position: { x: 5, y: 5 }, type: 'OreNode', remaining: 50 },
    ],
    energyNodes: [
      { id: 'e1', position: { x: 10, y: 10 }, productionRate: 150, stored: 3000, maxStored: 3000 },
    ],
    remains: [],
    characters: chars,
    nextCharacterId: chars.length + 1,
    nextObjectId: 100,
    tick: 0,
  };
}

describe('actions', () => {
  describe('MOVE', () => {
    it('accumulates force in specified direction', () => {
      const char = makeChar('c1', 10, 10);
      const world = makeWorld([char]);
      const forces = createForceMap();
      const result = actionEngine.executeAction(world, 'c1', { op: 'MOVE', direction: 0 }, forces);
      expect(result.success).toBe(true);
      const f = forces.get('c1')!;
      expect(f.fx).toBeCloseTo(DEFAULT_GAME_PARAMS.moveForce); // 0 degrees = right
      expect(f.fy).toBeCloseTo(0);
    });

    it('MOVE with register-based direction', () => {
      const char: Character = { ...makeChar('c1', 5, 6), registers: [270, null, null, null] };
      const world = makeWorld([char]);
      const forces = createForceMap();
      const result = actionEngine.executeAction(world, 'c1', { op: 'MOVE', direction: { register: 0 } }, forces);
      expect(result.success).toBe(true);
      const f = forces.get('c1')!;
      expect(f.fy).toBeLessThan(0);
    });

    it('MOVE fails when register is null', () => {
      const char = makeChar('c1', 5, 6);
      const world = makeWorld([char]);
      const forces = createForceMap();
      const result = actionEngine.executeAction(world, 'c1', { op: 'MOVE', direction: { register: 0 } }, forces);
      expect(result.success).toBe(false);
    });

    it('MOVE costs energy', () => {
      const char = makeChar('c1', 10, 10, 5000);
      const world = makeWorld([char]);
      const forces = createForceMap();
      const result = actionEngine.executeAction(world, 'c1', { op: 'MOVE', direction: 0 }, forces);
      const updated = result.world.characters.find((c) => c.id === 'c1')!;
      expect(updated.energy).toBe(5000 - DEFAULT_GAME_PARAMS.energyCosts['MOVE']);
    });

    it('MOVE always succeeds if energy sufficient', () => {
      const char = makeChar('c1', 0.5, 0.5);
      const world = makeWorld([char]);
      const forces = createForceMap();
      const result = actionEngine.executeAction(world, 'c1', { op: 'MOVE', direction: 180 }, forces);
      expect(result.success).toBe(true);
    });
  });

  describe('HARVEST', () => {
    it('harvests when within INTERACT_RANGE', () => {
      const char = makeChar('c1', 5, 5.5);
      const world = makeWorld([char]);
      const forces = createForceMap();
      const result = actionEngine.executeAction(world, 'c1', { op: 'HARVEST' }, forces);
      expect(result.success).toBe(true);
      const c = result.world.characters.find((c) => c.id === 'c1')!;
      expect(c.inventory['Ore']).toBe(1);
      const node = result.world.resourceNodes.find((n) => n.id === 'r1')!;
      expect(node.remaining).toBe(49);
    });

    it('fails when too far from resource node', () => {
      const char = makeChar('c1', 10, 10);
      const world = makeWorld([char]);
      const forces = createForceMap();
      const result = actionEngine.executeAction(world, 'c1', { op: 'HARVEST' }, forces);
      expect(result.success).toBe(false);
    });
  });

  describe('RECHARGE', () => {
    it('recharges when within INTERACT_RANGE of EnergyNode', () => {
      const char = makeChar('c1', 10, 10.5, 1000);
      const world = makeWorld([char]);
      const forces = createForceMap();
      const result = actionEngine.executeAction(world, 'c1', { op: 'RECHARGE' }, forces);
      expect(result.success).toBe(true);
      const c = result.world.characters.find((c) => c.id === 'c1')!;
      expect(c.energy).toBeGreaterThan(1000);
    });
  });

  describe('PROCESS', () => {
    it('processes Ore into Metal', () => {
      const char = { ...makeChar('c1', 10, 10), inventory: { Ore: 5 } };
      const world = makeWorld([char]);
      const forces = createForceMap();
      const result = actionEngine.executeAction(world, 'c1', { op: 'PROCESS', recipe: 'Metal' }, forces);
      expect(result.success).toBe(true);
      const c = result.world.characters.find((c) => c.id === 'c1')!;
      expect(c.inventory['Ore']).toBe(3);
      expect(c.inventory['Metal']).toBe(1);
    });
  });
});
