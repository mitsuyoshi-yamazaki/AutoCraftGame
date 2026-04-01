import { describe, it, expect } from 'vitest';
import {
  createCharacter,
  createInactiveCharacter,
  hasComponent,
  isActive,
  calculateBasalMetabolism,
  applyBasalMetabolism,
  decayDurability,
  isDead,
} from '../src/character.js';
import { MIN_COMPONENTS } from '../src/recipes.js';
import { METABOLISM, INVENTORY_METABOLISM_PER_ITEM, FRAME_DURABILITY } from '../src/constants.js';

describe('character', () => {
  const program = { rules: [] };

  it('creates active character with energy', () => {
    const c = createCharacter('c1', { x: 0, y: 0 }, MIN_COMPONENTS, program, 5000);
    expect(c.energy).toBe(5000);
    expect(c.durability).toBe(FRAME_DURABILITY);
    expect(isActive(c)).toBe(true);
  });

  it('creates inactive character with energy', () => {
    const c = createInactiveCharacter('c2', { x: 1, y: 1 }, MIN_COMPONENTS, 2000);
    expect(c.energy).toBe(2000);
    expect(isActive(c)).toBe(false);
  });

  it('hasComponent detects Charger', () => {
    const c = createCharacter('c1', { x: 0, y: 0 }, MIN_COMPONENTS, program, 1000);
    expect(hasComponent(c, 'Charger')).toBe(true);
    expect(hasComponent(c, 'Disassembler')).toBe(false);
  });

  it('calculates basal metabolism from components', () => {
    const c = createCharacter('c1', { x: 0, y: 0 }, MIN_COMPONENTS, program, 1000);
    const expected = MIN_COMPONENTS.reduce((sum, comp) => sum + METABOLISM[comp], 0);
    expect(calculateBasalMetabolism(c)).toBe(expected);
  });

  it('basal metabolism includes inventory cost with ceil rounding', () => {
    const c = createCharacter('c1', { x: 0, y: 0 }, ['Frame'], program, 1000);
    const withInv = { ...c, inventory: { Ore: 3 } };
    const componentCost = METABOLISM.Frame;
    const invCost = Math.ceil(3 * INVENTORY_METABOLISM_PER_ITEM);
    expect(calculateBasalMetabolism(withInv)).toBe(componentCost + invCost);
  });

  it('applyBasalMetabolism reduces energy', () => {
    const c = createCharacter('c1', { x: 0, y: 0 }, MIN_COMPONENTS, program, 5000);
    const after = applyBasalMetabolism(c);
    expect(after.energy).toBeLessThan(c.energy);
    expect(after.energy).toBe(5000 - calculateBasalMetabolism(c));
  });

  it('decayDurability reduces by 1', () => {
    const c = createCharacter('c1', { x: 0, y: 0 }, ['Frame'], program, 1000);
    const after = decayDurability(c);
    expect(after.durability).toBe(c.durability - 1);
  });

  it('isDead when durability <= 0', () => {
    const c = createCharacter('c1', { x: 0, y: 0 }, ['Frame'], program, 1000);
    expect(isDead(c)).toBe(false);
    expect(isDead({ ...c, durability: 0 })).toBe(true);
    expect(isDead({ ...c, durability: -1 })).toBe(true);
  });
});
