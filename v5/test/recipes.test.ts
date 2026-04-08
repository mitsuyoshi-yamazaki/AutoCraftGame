import { describe, it, expect } from 'vitest';
import {
  createRecipeEngine,
  hasItems,
  removeItems,
  addItem,
  addItems,
  inventoryTotalCount,
  isComponentType,
  MIN_COMPONENTS,
} from '../src/recipes.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { Inventory, ComponentType } from '../src/types.js';

const re = createRecipeEngine(DEFAULT_GAME_PARAMS);

describe('createRecipeEngine', () => {
  describe('findProcessRecipe', () => {
    it('finds Metal recipe', () => {
      const recipe = re.findProcessRecipe('Metal');
      expect(recipe).toBeDefined();
      expect(recipe!.output).toBe('Metal');
      expect(recipe!.inputs).toEqual({ Ore: 2 });
    });

    it('finds Circuit recipe', () => {
      const recipe = re.findProcessRecipe('Circuit');
      expect(recipe).toBeDefined();
      expect(recipe!.output).toBe('Circuit');
      expect(recipe!.inputs).toEqual({ Crystal: 2 });
    });

    it('returns undefined for unknown output', () => {
      expect(re.findProcessRecipe('Unknown')).toBeUndefined();
    });
  });

  describe('findCraftRecipe', () => {
    it('finds Frame recipe', () => {
      const recipe = re.findCraftRecipe('Frame');
      expect(recipe).toBeDefined();
      expect(recipe!.output).toBe('Frame');
      expect(recipe!.inputs).toEqual({ Metal: 3 });
    });

    it('finds Actuator recipe', () => {
      const recipe = re.findCraftRecipe('Actuator');
      expect(recipe).toBeDefined();
      expect(recipe!.inputs).toEqual({ Metal: 1, Circuit: 1 });
    });

    it('returns undefined for raw materials', () => {
      expect(re.findCraftRecipe('Ore')).toBeUndefined();
    });
  });

  describe('getItemMass', () => {
    it('returns mass for raw materials', () => {
      expect(re.getItemMass('Ore')).toBe(1);
      expect(re.getItemMass('Crystal')).toBe(1);
    });

    it('returns mass for processed materials', () => {
      expect(re.getItemMass('Metal')).toBe(2);
      expect(re.getItemMass('Circuit')).toBe(2);
    });

    it('returns mass for components', () => {
      expect(re.getItemMass('Frame')).toBe(6);
      expect(re.getItemMass('Processor')).toBe(6);
      expect(re.getItemMass('Actuator')).toBe(4);
    });

    it('returns 0 for unknown item', () => {
      expect(re.getItemMass('Unknown')).toBe(0);
    });
  });

  describe('calculateMass', () => {
    it('sums mass of components', () => {
      const components: readonly ComponentType[] = ['Frame', 'Actuator'];
      const mass = re.calculateMass(components, {});
      expect(mass).toBe(6 + 4); // Frame=6, Actuator=4
    });

    it('includes inventory mass', () => {
      const components: readonly ComponentType[] = ['Frame'];
      const inventory: Inventory = { Ore: 3, Metal: 2 };
      const mass = re.calculateMass(components, inventory);
      // Frame=6, Ore=3*1=3, Metal=2*2=4 => 13
      expect(mass).toBe(13);
    });

    it('returns 0 for empty character', () => {
      const mass = re.calculateMass([], {});
      expect(mass).toBe(0);
    });
  });
});

describe('hasItems', () => {
  it('returns true when inventory has required items', () => {
    const inv: Inventory = { Ore: 5, Crystal: 3 };
    expect(hasItems(inv, { Ore: 2, Crystal: 3 })).toBe(true);
  });

  it('returns true when inventory has exact amounts', () => {
    const inv: Inventory = { Ore: 2 };
    expect(hasItems(inv, { Ore: 2 })).toBe(true);
  });

  it('returns false when inventory is insufficient', () => {
    const inv: Inventory = { Ore: 1 };
    expect(hasItems(inv, { Ore: 2 })).toBe(false);
  });

  it('returns false when inventory is missing an item', () => {
    const inv: Inventory = { Ore: 5 };
    expect(hasItems(inv, { Ore: 2, Crystal: 1 })).toBe(false);
  });

  it('returns true for empty requirements', () => {
    expect(hasItems({}, {})).toBe(true);
  });
});

describe('removeItems', () => {
  it('removes specified quantities', () => {
    const inv: Inventory = { Ore: 5, Crystal: 3 };
    const result = removeItems(inv, { Ore: 2, Crystal: 1 });
    expect(result).toEqual({ Ore: 3, Crystal: 2 });
  });

  it('removes item key when count reaches 0', () => {
    const inv: Inventory = { Ore: 2, Crystal: 3 };
    const result = removeItems(inv, { Ore: 2 });
    expect(result.Ore).toBeUndefined();
    expect(result.Crystal).toBe(3);
  });

  it('does not mutate original inventory', () => {
    const inv: Inventory = { Ore: 5 };
    const result = removeItems(inv, { Ore: 2 });
    expect(inv.Ore).toBe(5);
    expect(result.Ore).toBe(3);
  });
});

describe('addItem', () => {
  it('adds item to empty inventory', () => {
    const result = addItem({}, 'Ore', 3);
    expect(result).toEqual({ Ore: 3 });
  });

  it('increments existing item count', () => {
    const inv: Inventory = { Ore: 2 };
    const result = addItem(inv, 'Ore', 3);
    expect(result).toEqual({ Ore: 5 });
  });

  it('defaults to adding 1', () => {
    const result = addItem({}, 'Crystal');
    expect(result).toEqual({ Crystal: 1 });
  });

  it('does not mutate original inventory', () => {
    const inv: Inventory = { Ore: 2 };
    addItem(inv, 'Ore', 3);
    expect(inv.Ore).toBe(2);
  });
});

describe('addItems', () => {
  it('adds multiple items', () => {
    const inv: Inventory = { Ore: 1 };
    const result = addItems(inv, { Ore: 2, Crystal: 3 });
    expect(result).toEqual({ Ore: 3, Crystal: 3 });
  });
});

describe('inventoryTotalCount', () => {
  it('returns 0 for empty inventory', () => {
    expect(inventoryTotalCount({})).toBe(0);
  });

  it('sums all item counts', () => {
    expect(inventoryTotalCount({ Ore: 3, Crystal: 2, Metal: 1 })).toBe(6);
  });
});

describe('isComponentType', () => {
  it('returns true for valid component types', () => {
    expect(isComponentType('Frame')).toBe(true);
    expect(isComponentType('MemoryCore')).toBe(true);
    expect(isComponentType('Disassembler')).toBe(true);
  });

  it('returns false for non-component items', () => {
    expect(isComponentType('Ore')).toBe(false);
    expect(isComponentType('Metal')).toBe(false);
    expect(isComponentType('Unknown')).toBe(false);
  });
});

describe('MIN_COMPONENTS', () => {
  it('contains the expected set of components', () => {
    expect(MIN_COMPONENTS).toContain('Frame');
    expect(MIN_COMPONENTS).toContain('Actuator');
    expect(MIN_COMPONENTS).toContain('Processor');
    expect(MIN_COMPONENTS).toContain('MemoryCore');
    expect(MIN_COMPONENTS.length).toBe(8);
  });
});
