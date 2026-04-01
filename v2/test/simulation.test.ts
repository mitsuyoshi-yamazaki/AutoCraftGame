import { describe, it, expect } from 'vitest';
import { executeTick, runSimulation } from '../src/simulation.js';
import { createCharacter } from '../src/character.js';
import { addCharacter } from '../src/world.js';
import type { World, Program } from '../src/types.js';
import { FRAME_DURABILITY } from '../src/constants.js';

const program: Program = { rules: [{ condition: { op: 'true' }, action: { op: 'NOOP' } }] };

function emptyWorld(): World {
  return {
    width: 10, height: 10,
    resourceNodes: [], energyNodes: [], remains: [],
    characters: [], nextCharacterId: 1, tick: 0,
  };
}

describe('simulation', () => {
  it('EnergyNode produces energy each tick', () => {
    const world: World = {
      ...emptyWorld(),
      energyNodes: [{ position: { x: 0, y: 0 }, productionRate: 100, stored: 500, maxStored: 2000 }],
      characters: [createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 5000)],
    };
    const result = executeTick(world);
    expect(result.world.energyNodes[0].stored).toBe(600);
  });

  it('basal metabolism is applied each tick', () => {
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 5000);
    const world: World = { ...emptyWorld(), characters: [c] };
    const result = executeTick(world);
    const after = result.world.characters.find((ch) => ch.id === 'c1')!;
    expect(after.energy).toBeLessThan(5000);
  });

  it('durability decays by 1 each tick', () => {
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 5000);
    const world: World = { ...emptyWorld(), characters: [c] };
    const result = executeTick(world);
    const after = result.world.characters.find((ch) => ch.id === 'c1')!;
    expect(after.durability).toBe(FRAME_DURABILITY - 1);
  });

  it('dead character generates remains', () => {
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 5000);
    const dying = { ...c, durability: 1 }; // will be 0 after decay
    const world: World = { ...emptyWorld(), characters: [dying] };
    const result = executeTick(world);
    expect(result.world.characters.length).toBe(0);
    expect(result.world.remains.length).toBe(1);
    expect(result.world.remains[0].components).toContain('Frame');
    expect(result.events).toContainEqual({ type: 'character_died', id: 'c1' });
  });

  it('depleted ResourceNodes are removed', () => {
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 5000);
    const world: World = {
      ...emptyWorld(),
      characters: [c],
      resourceNodes: [
        { position: { x: 0, y: 0 }, type: 'OreNode', remaining: 0 },
        { position: { x: 1, y: 1 }, type: 'CrystalNode', remaining: 5 },
      ],
    };
    const result = executeTick(world);
    expect(result.world.resourceNodes.length).toBe(1);
  });

  it('simulation stops when all characters die', () => {
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 5000);
    const dying = { ...c, durability: 1 };
    const world: World = { ...emptyWorld(), characters: [dying] };
    const { world: finalWorld } = runSimulation(world, 100);
    expect(finalWorld.tick).toBe(1);
    expect(finalWorld.characters.length).toBe(0);
  });

  it('tick counter increments', () => {
    const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 50000);
    const world: World = { ...emptyWorld(), characters: [c] };
    const { world: finalWorld } = runSimulation(world, 5);
    expect(finalWorld.tick).toBe(5);
  });
});
