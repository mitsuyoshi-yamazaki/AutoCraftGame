import { describe, it, expect } from 'vitest';
import { angleTo, createProgramEngine } from '../src/program.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { Character, World, Program, Condition } from '../src/types.js';
import { createGroundGrid } from '../src/ground.js';

const { evaluateProgram, findNearestAngle } = createProgramEngine(DEFAULT_GAME_PARAMS);

// evaluateCondition is internal to the engine; test via evaluateProgram or inline conditions
function evaluateCondition(cond: Condition, char: Character, world: World): boolean {
  // Use a program with this condition to test
  const program: Program = {
    rules: [{ condition: cond, action: { op: 'HARVEST' } }],
  };
  const { action } = evaluateProgram(program, char, world);
  return action.op === 'HARVEST';
}

function makeChar(x: number, y: number): Character {
  return {
    id: 'c1',
    species: 'test',
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    components: ['Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'Charger', 'MemoryCore'],
    inventory: {},
    durability: 300,
    energy: 5000,
    program: null,
    senseData: null,
    registers: [],
  };
}

function makeWorld(): World {
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
    characters: [],
    groundGrid: createGroundGrid(20, 20),
    nextCharacterId: 1,
    nextObjectId: 100,
    tick: 0,
  };
}

describe('program', () => {
  describe('angleTo', () => {
    it('returns 0 for right direction', () => {
      expect(angleTo({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0);
    });

    it('returns 90 for down direction', () => {
      expect(angleTo({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    });

    it('returns 180 for left direction', () => {
      expect(angleTo({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180);
    });

    it('returns 270 for up direction', () => {
      expect(angleTo({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(270);
    });

    it('returns 45 for down-right diagonal', () => {
      expect(angleTo({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(45);
    });
  });

  describe('evaluateCondition', () => {
    it('true condition always returns true', () => {
      const cond: Condition = { op: 'true' };
      expect(evaluateCondition(cond, makeChar(0, 0), makeWorld())).toBe(true);
    });

    it('nearby condition uses Euclidean distance', () => {
      const char = makeChar(5, 6); // distance to OreNode at (5,5) = 1.0
      const world = makeWorld();
      world.characters = [char] as any;
      expect(evaluateCondition({ op: 'nearby', type: 'OreNode', radius: 1.0 }, char, world)).toBe(true);
      expect(evaluateCondition({ op: 'nearby', type: 'OreNode', radius: 0.5 }, char, world)).toBe(false);
    });

    it('energy_below condition', () => {
      const char = { ...makeChar(0, 0), energy: 2000 };
      expect(evaluateCondition({ op: 'energy_below', threshold: 3000 }, char, makeWorld())).toBe(true);
      expect(evaluateCondition({ op: 'energy_below', threshold: 1000 }, char, makeWorld())).toBe(false);
    });
  });

  describe('findNearestAngle', () => {
    it('finds angle to nearest OreNode', () => {
      const char = makeChar(5, 8); // OreNode at (5,5), direction is straight up → 270 deg
      const world = { ...makeWorld(), characters: [char] };
      const angle = findNearestAngle('OreNode', char, world);
      expect(angle).toBeCloseTo(270);
    });
  });

  describe('evaluateProgram', () => {
    it('returns NOOP when no rules match', () => {
      const program: Program = { rules: [] };
      const { action } = evaluateProgram(program, makeChar(0, 0), makeWorld());
      expect(action.op).toBe('NOOP');
    });

    it('returns first matching rule action', () => {
      const program: Program = {
        rules: [
          { condition: { op: 'energy_below', threshold: 100 }, action: { op: 'RECHARGE' } },
          { condition: { op: 'true' }, action: { op: 'NOOP' } },
        ],
      };
      const { action } = evaluateProgram(program, makeChar(0, 0), makeWorld());
      expect(action.op).toBe('NOOP');
    });
  });
});
