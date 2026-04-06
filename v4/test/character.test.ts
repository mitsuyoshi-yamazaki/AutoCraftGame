import { describe, it, expect } from 'vitest';
import {
  createCharacterEngine,
  isActive,
  isDead,
  hasComponent,
} from '../src/character.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { Character, ComponentType } from '../src/types.js';

const engine = createCharacterEngine(DEFAULT_GAME_PARAMS);

const BASE_COMPONENTS: readonly ComponentType[] = [
  'Frame', 'Actuator', 'Sensor', 'Processor',
  'Harvester', 'Assembler', 'Charger', 'MemoryCore',
];

describe('createCharacter', () => {
  it('creates an active character with correct fields', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 10, y: 20 }, BASE_COMPONENTS, [1, 2, 3], 500, 'species-A', 0,
    );
    expect(ch.id).toBe('c-001');
    expect(ch.species).toBe('species-A');
    expect(ch.position).toEqual({ x: 10, y: 20 });
    expect(ch.velocity).toEqual({ vx: 0, vy: 0 });
    expect(ch.components).toEqual(BASE_COMPONENTS);
    expect(ch.inventory).toEqual({});
    expect(ch.energy).toBe(500);
    expect(ch.createdAt).toBe(0);
    expect(ch.vm.active).toBe(true);
    expect(ch.vm.pc).toBe(0);
  });

  it('sets durability based on Frame count', () => {
    const ch1 = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, ['Frame', 'MemoryCore'], [1], 100, 's', 0,
    );
    expect(ch1.durability).toBe(DEFAULT_GAME_PARAMS.frameDurability);

    const ch2 = engine.createCharacter(
      'c-002', { x: 0, y: 0 }, ['Frame', 'Frame', 'MemoryCore'], [1], 100, 's', 0,
    );
    expect(ch2.durability).toBe(DEFAULT_GAME_PARAMS.frameDurability * 2);
  });

  it('sets memory size based on MemoryCore count', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, ['Frame', 'MemoryCore', 'MemoryCore'], [1], 100, 's', 0,
    );
    expect(ch.vm.memory.length).toBe(DEFAULT_GAME_PARAMS.memoryCoreWords * 2);
  });

  it('loads program into memory', () => {
    const program = [10, 20, 30];
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, ['Frame', 'MemoryCore'], program, 100, 's', 0,
    );
    expect(ch.vm.memory[0]).toBe(10);
    expect(ch.vm.memory[1]).toBe(20);
    expect(ch.vm.memory[2]).toBe(30);
    expect(ch.vm.memory[3]).toBe(0);
  });
});

describe('createInactiveCharacter', () => {
  it('creates an inactive character', () => {
    const ch = engine.createInactiveCharacter(
      'c-002', { x: 5, y: 5 }, BASE_COMPONENTS, 300, 'species-B', 10,
    );
    expect(ch.vm.active).toBe(false);
    expect(ch.energy).toBe(300);
    expect(ch.createdAt).toBe(10);
  });

  it('has zeroed memory', () => {
    const ch = engine.createInactiveCharacter(
      'c-002', { x: 0, y: 0 }, ['Frame', 'MemoryCore'], 100, 's', 0,
    );
    expect(ch.vm.memory.every((v) => v === 0)).toBe(true);
  });
});

describe('isActive', () => {
  it('returns true for active character', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, ['Frame', 'MemoryCore'], [1], 100, 's', 0,
    );
    expect(isActive(ch)).toBe(true);
  });

  it('returns false for inactive character', () => {
    const ch = engine.createInactiveCharacter(
      'c-002', { x: 0, y: 0 }, ['Frame', 'MemoryCore'], 100, 's', 0,
    );
    expect(isActive(ch)).toBe(false);
  });
});

describe('isDead', () => {
  it('returns false when durability > 0', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, ['Frame', 'MemoryCore'], [1], 100, 's', 0,
    );
    expect(isDead(ch)).toBe(false);
  });

  it('returns true when durability is 0', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, ['Frame', 'MemoryCore'], [1], 100, 's', 0,
    );
    const dead: Character = { ...ch, durability: 0 };
    expect(isDead(dead)).toBe(true);
  });
});

describe('hasComponent', () => {
  it('returns true when component exists', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, BASE_COMPONENTS, [1], 100, 's', 0,
    );
    expect(hasComponent(ch, 'Frame')).toBe(true);
    expect(hasComponent(ch, 'Sensor')).toBe(true);
  });

  it('returns false when component does not exist', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, ['Frame', 'MemoryCore'], [1], 100, 's', 0,
    );
    expect(hasComponent(ch, 'Disassembler')).toBe(false);
  });
});

describe('calculateBasalMetabolism', () => {
  it('computes component cost for a young character with no inventory', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, BASE_COMPONENTS, [1], 100, 's', 0,
    );
    // Components: Frame=1, Actuator=2, Sensor=2, Processor=3, Harvester=2, Assembler=3, Charger=2, MemoryCore=1 => 16
    // Young (age=0 <= N=3000) => coefficient=1 => componentCost=16
    // No inventory => 0, energy=100 << threshold => 0
    const cost = engine.calculateBasalMetabolism(ch, 0);
    expect(cost).toBe(16);
  });

  it('includes inventory cost', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, BASE_COMPONENTS, [1], 100, 's', 0,
    );
    const withItems: Character = { ...ch, inventory: { Ore: 5, Crystal: 3 } };
    // componentCost=16, inventoryCost=ceil(8*1)=8, energyCost=0
    const cost = engine.calculateBasalMetabolism(withItems, 0);
    expect(cost).toBe(16 + 8);
  });

  it('includes energy metabolism for high energy', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, BASE_COMPONENTS, [1], 6000, 's', 0,
    );
    // excess = 6000 - 3000 = 3000
    // energyCost = floor(3000*3000 / 9_000_000) = floor(1) = 1
    const cost = engine.calculateBasalMetabolism(ch, 0);
    expect(cost).toBe(16 + 1);
  });

  it('applies aging coefficient after aging threshold', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, BASE_COMPONENTS, [1], 100, 's', 0,
    );
    // age=4500, N=3000, M=6000
    // ratio = (4500-3000)/(6000-3000) = 0.5
    // coefficient = 1 + 0.25 = 1.25
    // componentCost = ceil(16 * 1.25) = ceil(20) = 20
    const cost = engine.calculateBasalMetabolism(ch, 4500);
    expect(cost).toBe(20);
  });
});

describe('calculateAgingCoefficient', () => {
  it('returns 1.0 when age <= N', () => {
    expect(engine.calculateAgingCoefficient(0)).toBe(1.0);
    expect(engine.calculateAgingCoefficient(3000)).toBe(1.0);
  });

  it('increases quadratically after N', () => {
    // age=6000 (=M): ratio = 1.0, coefficient = 1 + 1 = 2
    expect(engine.calculateAgingCoefficient(6000)).toBe(2.0);
  });
});

describe('applyBasalMetabolism', () => {
  it('reduces energy by metabolism cost', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, BASE_COMPONENTS, [1], 500, 's', 0,
    );
    const result = engine.applyBasalMetabolism(ch, 0);
    expect(result.energy).toBe(500 - 16);
  });

  it('does not reduce energy below 0', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, BASE_COMPONENTS, [1], 5, 's', 0,
    );
    const result = engine.applyBasalMetabolism(ch, 0);
    expect(result.energy).toBe(0);
  });

  it('returns a new object (immutable)', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, BASE_COMPONENTS, [1], 500, 's', 0,
    );
    const result = engine.applyBasalMetabolism(ch, 0);
    expect(result).not.toBe(ch);
    expect(ch.energy).toBe(500); // original unchanged
  });
});

describe('canPayMetabolism', () => {
  it('returns true when energy is sufficient', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, BASE_COMPONENTS, [1], 500, 's', 0,
    );
    expect(engine.canPayMetabolism(ch, 0)).toBe(true);
  });

  it('returns false when energy is insufficient', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, BASE_COMPONENTS, [1], 5, 's', 0,
    );
    expect(engine.canPayMetabolism(ch, 0)).toBe(false);
  });
});

describe('decayDurability', () => {
  it('decays by normal rate when not starving', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, ['Frame', 'MemoryCore'], [1], 100, 's', 0,
    );
    const result = engine.decayDurability(ch, false);
    expect(result.durability).toBe(ch.durability - DEFAULT_GAME_PARAMS.durabilityDecayNormal);
  });

  it('decays faster when starving', () => {
    const ch = engine.createCharacter(
      'c-001', { x: 0, y: 0 }, ['Frame', 'MemoryCore'], [1], 100, 's', 0,
    );
    const result = engine.decayDurability(ch, true);
    expect(result.durability).toBe(ch.durability - DEFAULT_GAME_PARAMS.durabilityDecayStarving);
  });
});
