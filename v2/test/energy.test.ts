import { describe, it, expect } from 'vitest';
import { executeTick, runSimulation } from '../src/simulation.js';
import { createCharacter, calculateBasalMetabolism } from '../src/character.js';
import type { World, Program } from '../src/types.js';
import { ENERGY_COST_RECHARGE, RECHARGE_AMOUNT } from '../src/constants.js';

function emptyWorld(): World {
  return {
    width: 10, height: 10,
    resourceNodes: [], energyNodes: [], remains: [],
    characters: [], nextCharacterId: 1, tick: 0,
  };
}

describe('energy model integration', () => {
  it('character recharges energy from EnergyNode via program', () => {
    const program: Program = {
      rules: [
        { condition: { op: 'nearby', type: 'EnergyNode', radius: 1 }, action: { op: 'RECHARGE' } },
        { condition: { op: 'true' }, action: { op: 'NOOP' } },
      ],
    };
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Charger'], program, 1000);
    const world: World = {
      ...emptyWorld(),
      characters: [c],
      energyNodes: [{ position: { x: 5, y: 4 }, productionRate: 200, stored: 2000, maxStored: 2000 }],
    };

    const result = executeTick(world);
    const after = result.world.characters.find((ch) => ch.id === 'c1')!;
    const metabolism = calculateBasalMetabolism(c);
    // 1000 + RECHARGE_AMOUNT - ENERGY_COST_RECHARGE - metabolism
    expect(after.energy).toBe(1000 + RECHARGE_AMOUNT - ENERGY_COST_RECHARGE - metabolism);
  });

  it('energy depletion leads to inaction then death', () => {
    const program: Program = {
      rules: [{ condition: { op: 'true' }, action: { op: 'NOOP' } }],
    };
    // Start with very little energy and low durability
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 50);
    const lowDur = { ...c, durability: 5 };
    const world: World = { ...emptyWorld(), characters: [lowDur] };

    const { world: finalWorld, allEvents } = runSimulation(world, 100);
    expect(finalWorld.characters.length).toBe(0);
    expect(allEvents.some((e) => e.type === 'character_died')).toBe(true);
    // Should have generated remains
    expect(finalWorld.remains.length).toBe(1);
  });

  it('more components = higher basal metabolism', () => {
    const program: Program = { rules: [] };
    const minimal = createCharacter('c1', { x: 0, y: 0 }, ['Frame'], program, 1000);
    const full = createCharacter('c2', { x: 1, y: 1 },
      ['Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'Charger', 'MemoryCore'],
      program, 1000);

    expect(calculateBasalMetabolism(full)).toBeGreaterThan(calculateBasalMetabolism(minimal));
  });
});
