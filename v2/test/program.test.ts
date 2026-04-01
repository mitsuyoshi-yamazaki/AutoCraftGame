import { describe, it, expect } from 'vitest';
import { evaluateCondition, evaluateProgram } from '../src/program.js';
import { createCharacter } from '../src/character.js';
import type { World, Condition, Program } from '../src/types.js';

const program: Program = { rules: [] };

function emptyWorld(): World {
  return {
    width: 10, height: 10,
    resourceNodes: [], energyNodes: [], remains: [],
    characters: [], nextCharacterId: 1, tick: 0,
  };
}

describe('program evaluation', () => {
  it('energy_below condition', () => {
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 500);
    const world: World = { ...emptyWorld(), characters: [c] };
    const cond: Condition = { op: 'energy_below', threshold: 1000 };
    expect(evaluateCondition(cond, c, world)).toBe(true);
    const cond2: Condition = { op: 'energy_below', threshold: 100 };
    expect(evaluateCondition(cond2, c, world)).toBe(false);
  });

  it('nearby Remains', () => {
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 1000);
    const world: World = {
      ...emptyWorld(),
      characters: [c],
      remains: [{ position: { x: 5, y: 6 }, components: ['Frame'], inventory: {} }],
    };
    const cond: Condition = { op: 'nearby', type: 'Remains', radius: 1 };
    expect(evaluateCondition(cond, c, world)).toBe(true);
    const cond2: Condition = { op: 'nearby', type: 'Remains', radius: 0 };
    expect(evaluateCondition(cond2, c, world)).toBe(false);
  });

  it('nearby EnergyNode', () => {
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 1000);
    const world: World = {
      ...emptyWorld(),
      characters: [c],
      energyNodes: [{ position: { x: 5, y: 3 }, productionRate: 100, stored: 500, maxStored: 1000 }],
    };
    const cond: Condition = { op: 'nearby', type: 'EnergyNode', radius: 3 };
    expect(evaluateCondition(cond, c, world)).toBe(true);
  });

  it('evaluateProgram returns first matching rule action', () => {
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 500);
    const world: World = { ...emptyWorld(), characters: [c] };
    const p: Program = {
      rules: [
        { condition: { op: 'energy_below', threshold: 1000 }, action: { op: 'RECHARGE' } },
        { condition: { op: 'true' }, action: { op: 'NOOP' } },
      ],
    };
    const { action } = evaluateProgram(p, c, world);
    expect(action.op).toBe('RECHARGE');
  });
});
