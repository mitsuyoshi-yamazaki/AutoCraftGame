import { describe, it, expect } from 'vitest';
import { executeTick, runSimulation } from '../src/simulation.js';
import { createCharacter } from '../src/character.js';
import { createWorld, addCharacter, nextCharacterId } from '../src/world.js';
import { MIN_COMPONENTS } from '../src/recipes.js';
import type { Program } from '../src/types.js';

describe('simulation', () => {
  it('tick increments world tick counter', () => {
    let world = createWorld(10, 10);
    const { id, world: w2 } = nextCharacterId(world);
    const program: Program = { rules: [{ condition: { op: 'true' }, action: { op: 'NOOP' } }] };
    const char = createCharacter(id, { x: 1, y: 1 }, MIN_COMPONENTS, program);
    world = addCharacter(w2, char);

    const result = executeTick(world);
    expect(result.world.tick).toBe(1);
  });

  it('character dies after durability reaches 0', () => {
    let world = createWorld(10, 10);
    const { id, world: w2 } = nextCharacterId(world);
    const program: Program = { rules: [{ condition: { op: 'true' }, action: { op: 'NOOP' } }] };
    const char = createCharacter(id, { x: 1, y: 1 }, MIN_COMPONENTS, program);
    // Set low durability — will die after 1 tick of decay
    const dyingChar = { ...char, durability: 1 };
    world = addCharacter(w2, dyingChar);

    const result = executeTick(world);
    expect(result.world.characters).toHaveLength(0);
    expect(result.events).toContainEqual({ type: 'character_died', id });
  });

  it('runSimulation stops early when no characters remain', () => {
    let world = createWorld(10, 10);
    const { id, world: w2 } = nextCharacterId(world);
    const program: Program = { rules: [{ condition: { op: 'true' }, action: { op: 'NOOP' } }] };
    const char = createCharacter(id, { x: 1, y: 1 }, MIN_COMPONENTS, program);
    const dyingChar = { ...char, durability: 3 };
    world = addCharacter(w2, dyingChar);

    const { world: finalWorld } = runSimulation(world, 100);
    expect(finalWorld.tick).toBe(3); // died on tick 3
    expect(finalWorld.characters).toHaveLength(0);
  });

  it('resources regenerate each tick', () => {
    let world = createWorld(10, 10);
    const { id, world: w2 } = nextCharacterId(world);
    const oreNode = w2.resourceNodes.find((n) => n.type === 'OreNode')!;
    const program: Program = { rules: [{ condition: { op: 'true' }, action: { op: 'HARVEST' } }] };
    const char = createCharacter(id, oreNode.position, MIN_COMPONENTS, program);
    world = addCharacter(w2, char);

    // Tick 1: harvest depletes node, then regeneration restores it
    const result1 = executeTick(world);
    const nodeAfter = result1.world.resourceNodes.find(
      (n) => n.position.x === oreNode.position.x && n.position.y === oreNode.position.y,
    )!;
    expect(nodeAfter.depleted).toBe(false); // regenerated

    // Character gained Ore
    const charAfter = result1.world.characters.find((c) => c.id === id)!;
    expect(charAfter.inventory['Ore']).toBe(1);
  });
});
