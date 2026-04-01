import { describe, it, expect } from 'vitest';
import {
  PROCESS_RECIPES,
  CRAFT_RECIPES,
  MIN_COMPONENTS,
  findProcessRecipe,
  findCraftRecipe,
  hasItems,
  removeItems,
  addItem,
  addItems,
  inventoryTotalCount,
  isComponentType,
} from '../src/recipes.js';

describe('recipes', () => {
  it('has process recipes for Metal and Circuit', () => {
    expect(findProcessRecipe('Metal')).toBeDefined();
    expect(findProcessRecipe('Circuit')).toBeDefined();
  });

  it('has craft recipes for all component types including Disassembler and Charger', () => {
    for (const comp of MIN_COMPONENTS) {
      expect(findCraftRecipe(comp)).toBeDefined();
    }
    expect(findCraftRecipe('Disassembler')).toBeDefined();
  });

  it('Disassembler recipe matches Assembler', () => {
    const assembler = findCraftRecipe('Assembler')!;
    const disassembler = findCraftRecipe('Disassembler')!;
    expect(disassembler.inputs).toEqual(assembler.inputs);
  });

  it('Charger recipe is Metal 1 + Circuit 2', () => {
    const charger = findCraftRecipe('Charger')!;
    expect(charger.inputs).toEqual({ Metal: 1, Circuit: 2 });
  });

  it('MIN_COMPONENTS includes Charger but not Disassembler', () => {
    expect(MIN_COMPONENTS).toContain('Charger');
    expect(MIN_COMPONENTS).not.toContain('Disassembler');
  });

  it('hasItems checks inventory correctly', () => {
    const inv = { Ore: 5, Crystal: 3 };
    expect(hasItems(inv, { Ore: 5 })).toBe(true);
    expect(hasItems(inv, { Ore: 6 })).toBe(false);
    expect(hasItems(inv, { Ore: 2, Crystal: 3 })).toBe(true);
  });

  it('removeItems and addItem work correctly', () => {
    const inv = { Ore: 5, Crystal: 3 };
    const after = removeItems(inv, { Ore: 2 });
    expect(after.Ore).toBe(3);
    const added = addItem(after, 'Metal', 2);
    expect(added.Metal).toBe(2);
  });

  it('isComponentType identifies components', () => {
    expect(isComponentType('Frame')).toBe(true);
    expect(isComponentType('Charger')).toBe(true);
    expect(isComponentType('Disassembler')).toBe(true);
    expect(isComponentType('Ore')).toBe(false);
    expect(isComponentType('Metal')).toBe(false);
  });

  it('inventoryTotalCount sums all items', () => {
    expect(inventoryTotalCount({ Ore: 3, Crystal: 2, Metal: 1 })).toBe(6);
    expect(inventoryTotalCount({})).toBe(0);
  });
});
