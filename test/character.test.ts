import { describe, it, expect } from 'vitest';
import {
  createCharacter,
  createInactiveCharacter,
  hasComponent,
  isActive,
  decayDurability,
  isDead,
} from '../src/character.js';
import { MIN_COMPONENTS, FRAME_DURABILITY } from '../src/recipes.js';
import type { Program } from '../src/types.js';

const DUMMY_PROGRAM: Program = { rules: [{ condition: { op: 'true' }, action: { op: 'NOOP' } }] };

describe('character', () => {
  it('creates active character with correct durability', () => {
    const char = createCharacter('c1', { x: 0, y: 0 }, MIN_COMPONENTS, DUMMY_PROGRAM);
    expect(char.durability).toBe(FRAME_DURABILITY); // 1 Frame = 100
    expect(char.program).toBe(DUMMY_PROGRAM);
    expect(isActive(char)).toBe(true);
  });

  it('creates inactive character with no program', () => {
    const char = createInactiveCharacter('c2', { x: 1, y: 1 }, MIN_COMPONENTS);
    expect(char.program).toBeNull();
    expect(isActive(char)).toBe(false);
  });

  it('hasComponent checks component list', () => {
    const char = createCharacter('c1', { x: 0, y: 0 }, ['Frame', 'Processor'], DUMMY_PROGRAM);
    expect(hasComponent(char, 'Frame')).toBe(true);
    expect(hasComponent(char, 'Harvester')).toBe(false);
  });

  it('durability decays by 1 per tick', () => {
    const char = createCharacter('c1', { x: 0, y: 0 }, MIN_COMPONENTS, DUMMY_PROGRAM);
    const decayed = decayDurability(char);
    expect(decayed.durability).toBe(FRAME_DURABILITY - 1);
  });

  it('character dies when durability <= 0', () => {
    const char = createCharacter('c1', { x: 0, y: 0 }, MIN_COMPONENTS, DUMMY_PROGRAM);
    const dead = { ...char, durability: 0 };
    expect(isDead(dead)).toBe(true);
  });
});
