import { describe, it, expect } from 'vitest';
import { calculateMass, getItemMass, addItem, removeItems, hasItems, inventoryTotalCount } from '../src/recipes.js';
import type { ComponentType, Inventory } from '../src/types.js';

describe('recipes', () => {
  describe('calculateMass', () => {
    it('calculates mass for MIN_COMPONENTS with empty inventory', () => {
      const components: ComponentType[] = [
        'Frame', 'Actuator', 'Sensor', 'Processor',
        'Harvester', 'Assembler', 'Charger', 'MemoryCore',
      ];
      // Frame(6) + Actuator(4) + Sensor(4) + Processor(6)
      // + Harvester(4) + Assembler(6) + Charger(6) + MemoryCore(4) = 40
      expect(calculateMass(components, {})).toBe(40);
    });

    it('includes inventory items in mass', () => {
      const components: ComponentType[] = ['Frame'];
      const inv: Inventory = { Ore: 5, Metal: 3 };
      // Frame(6) + Ore(5×1) + Metal(3×2) = 6 + 5 + 6 = 17
      expect(calculateMass(components, inv)).toBe(17);
    });
  });

  describe('getItemMass', () => {
    it('returns correct mass for raw materials', () => {
      expect(getItemMass('Ore')).toBe(1);
      expect(getItemMass('Crystal')).toBe(1);
    });

    it('returns correct mass for processed materials', () => {
      expect(getItemMass('Metal')).toBe(2);
      expect(getItemMass('Circuit')).toBe(2);
    });

    it('returns correct mass for components', () => {
      expect(getItemMass('Frame')).toBe(6);
      expect(getItemMass('Processor')).toBe(6);
      expect(getItemMass('Actuator')).toBe(4);
    });
  });

  describe('inventory helpers', () => {
    it('addItem adds to inventory', () => {
      const inv = addItem({}, 'Ore', 3);
      expect(inv).toEqual({ Ore: 3 });
    });

    it('removeItems removes from inventory', () => {
      const inv = removeItems({ Ore: 5, Crystal: 2 }, { Ore: 3 });
      expect(inv).toEqual({ Ore: 2, Crystal: 2 });
    });

    it('hasItems checks inventory contents', () => {
      expect(hasItems({ Ore: 5 }, { Ore: 3 })).toBe(true);
      expect(hasItems({ Ore: 2 }, { Ore: 3 })).toBe(false);
    });

    it('inventoryTotalCount sums all items', () => {
      expect(inventoryTotalCount({ Ore: 5, Metal: 3 })).toBe(8);
    });
  });
});
