import { describe, it, expect } from 'vitest';
import {
  findProcessRecipe,
  findCraftRecipe,
  hasItems,
  removeItems,
  addItem,
  PROCESS_RECIPES,
  CRAFT_RECIPES,
  MIN_COMPONENTS,
} from '../src/recipes.js';

describe('recipes', () => {
  it('defines process recipes for Metal and Circuit', () => {
    expect(findProcessRecipe('Metal')).toEqual({ output: 'Metal', inputs: { Ore: 2 } });
    expect(findProcessRecipe('Circuit')).toEqual({ output: 'Circuit', inputs: { Crystal: 2 } });
  });

  it('defines craft recipes for all 7 components', () => {
    for (const comp of MIN_COMPONENTS) {
      expect(findCraftRecipe(comp)).toBeDefined();
    }
  });

  it('Frame requires Metal x3', () => {
    expect(findCraftRecipe('Frame')?.inputs).toEqual({ Metal: 3 });
  });

  it('hasItems returns true when inventory is sufficient', () => {
    expect(hasItems({ Ore: 5 }, { Ore: 2 })).toBe(true);
    expect(hasItems({ Ore: 1 }, { Ore: 2 })).toBe(false);
  });

  it('removeItems subtracts from inventory', () => {
    const result = removeItems({ Ore: 5, Crystal: 3 }, { Ore: 2 });
    expect(result).toEqual({ Ore: 3, Crystal: 3 });
  });

  it('addItem increments inventory', () => {
    const result = addItem({ Ore: 2 }, 'Ore', 3);
    expect(result).toEqual({ Ore: 5 });
  });

  it('minimum character requires Ore x16 and Crystal x18', () => {
    // Verify the total material cost from the spec
    let totalMetal = 0;
    let totalCircuit = 0;
    for (const comp of MIN_COMPONENTS) {
      const recipe = findCraftRecipe(comp)!;
      totalMetal += recipe.inputs['Metal'] ?? 0;
      totalCircuit += recipe.inputs['Circuit'] ?? 0;
    }
    // Metal from Ore x2, Circuit from Crystal x2
    expect(totalMetal * 2).toBe(16); // Ore needed
    expect(totalCircuit * 2).toBe(18); // Crystal needed
  });
});
