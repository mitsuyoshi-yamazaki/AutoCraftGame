import { describe, it, expect } from 'vitest';
import { evaluateCondition, evaluateProgram, executeAction } from '../src/program.js';
import { createCharacter } from '../src/character.js';
import { createWorld, addCharacter, nextCharacterId, createRng } from '../src/world.js';
import { MIN_COMPONENTS } from '../src/recipes.js';
import type { Condition, Program, World } from '../src/types.js';

const DUMMY_PROGRAM: Program = { rules: [{ condition: { op: 'true' }, action: { op: 'NOOP' } }] };

function worldWithCharacter() {
  let world = createWorld(20, 20, createRng(1));
  const { id, world: w2 } = nextCharacterId(world);
  world = w2;
  const char = createCharacter(id, { x: 5, y: 5 }, MIN_COMPONENTS, DUMMY_PROGRAM);
  world = addCharacter(world, char);
  return { world, character: char };
}

describe('condition evaluation', () => {
  it('true always matches', () => {
    const { character, world } = worldWithCharacter();
    expect(evaluateCondition({ op: 'true' }, character, world)).toBe(true);
  });

  it('inventory_has checks item count', () => {
    const { character, world } = worldWithCharacter();
    const withOre = { ...character, inventory: { Ore: 5 } };
    expect(evaluateCondition({ op: 'inventory_has', item: 'Ore', count: 3 }, withOre, world)).toBe(true);
    expect(evaluateCondition({ op: 'inventory_has', item: 'Ore', count: 10 }, withOre, world)).toBe(false);
  });

  it('durability_below checks threshold', () => {
    const { character, world } = worldWithCharacter();
    expect(evaluateCondition({ op: 'durability_below', threshold: 50 }, character, world)).toBe(false);
    const low = { ...character, durability: 30 };
    expect(evaluateCondition({ op: 'durability_below', threshold: 50 }, low, world)).toBe(true);
  });

  it('and requires all conditions', () => {
    const { character, world } = worldWithCharacter();
    const cond: Condition = {
      op: 'and',
      conditions: [{ op: 'true' }, { op: 'durability_below', threshold: 50 }],
    };
    expect(evaluateCondition(cond, character, world)).toBe(false);
  });

  it('or requires any condition', () => {
    const { character, world } = worldWithCharacter();
    const cond: Condition = {
      op: 'or',
      conditions: [{ op: 'true' }, { op: 'durability_below', threshold: 50 }],
    };
    expect(evaluateCondition(cond, character, world)).toBe(true);
  });

  it('not negates condition', () => {
    const { character, world } = worldWithCharacter();
    expect(evaluateCondition({ op: 'not', condition: { op: 'true' } }, character, world)).toBe(false);
  });
});

describe('program evaluation', () => {
  it('returns first matching rule action', () => {
    const { character, world } = worldWithCharacter();
    const program: Program = {
      rules: [
        { condition: { op: 'inventory_has', item: 'Ore', count: 99 }, action: { op: 'HARVEST' } },
        { condition: { op: 'true' }, action: { op: 'NOOP' } },
      ],
    };
    expect(evaluateProgram(program, character, world).action).toEqual({ op: 'NOOP' });
  });
});

describe('action execution', () => {
  it('HARVEST picks up resource from current tile', () => {
    const { world, character } = worldWithCharacter();
    // Place character on an ore node
    const oreNode = world.resourceNodes.find((n) => n.type === 'OreNode')!;
    const charOnOre = { ...character, position: oreNode.position };
    const w = { ...world, characters: world.characters.map((c) => (c.id === character.id ? charOnOre : c)) };

    const result = executeAction(w, character.id, { op: 'HARVEST' });
    expect(result.success).toBe(true);
    const updated = result.world.characters.find((c) => c.id === character.id)!;
    expect(updated.inventory['Ore']).toBe(1);
  });

  it('PROCESS converts raw materials', () => {
    const { world, character } = worldWithCharacter();
    const charWithOre = { ...character, inventory: { Ore: 4 } };
    const w = { ...world, characters: world.characters.map((c) => (c.id === character.id ? charWithOre : c)) };

    const result = executeAction(w, character.id, { op: 'PROCESS', recipe: 'Metal' });
    expect(result.success).toBe(true);
    const updated = result.world.characters.find((c) => c.id === character.id)!;
    expect(updated.inventory['Metal']).toBe(1);
    expect(updated.inventory['Ore']).toBe(2);
  });

  it('CRAFT creates component from processed materials', () => {
    const { world, character } = worldWithCharacter();
    const charWithMetal = { ...character, inventory: { Metal: 3 } };
    const w = { ...world, characters: world.characters.map((c) => (c.id === character.id ? charWithMetal : c)) };

    const result = executeAction(w, character.id, { op: 'CRAFT', component: 'Frame' });
    expect(result.success).toBe(true);
    const updated = result.world.characters.find((c) => c.id === character.id)!;
    expect(updated.inventory['Frame']).toBe(1);
  });

  it('MOVE changes character position', () => {
    const { world, character } = worldWithCharacter();
    const result = executeAction(world, character.id, { op: 'MOVE', direction: 'E' });
    expect(result.success).toBe(true);
    const updated = result.world.characters.find((c) => c.id === character.id)!;
    expect(updated.position).toEqual({ x: 6, y: 5 });
  });

  it('action fails without required component', () => {
    const { world } = worldWithCharacter();
    const { id: id2, world: w2 } = nextCharacterId(world);
    const noHarvester = createCharacter(id2, { x: 3, y: 3 }, ['Frame', 'Processor'], DUMMY_PROGRAM);
    const w3 = addCharacter(w2, noHarvester);

    const result = executeAction(w3, id2, { op: 'HARVEST' });
    expect(result.success).toBe(false);
  });
});
