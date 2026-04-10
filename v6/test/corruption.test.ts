import { describe, it, expect } from 'vitest';
import { corruptCharacterMemory } from '../src/corruption.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createRng, createWorld, addCharacter } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';

const engine = createEngine(DEFAULT_GAME_PARAMS);
const rng = createRng(42);
const baseWorld = createWorld(DEFAULT_WORLD_CONFIG, rng, engine.worldEngine);

function makeChar(memValues: number[]) {
  const components = [
    'Frame', 'Frame', 'Actuator', 'Harvester', 'Charger',
    'Assembler', 'Processor', 'Sensor', 'MemoryCore', 'MemoryCore',
  ] as const;
  const char = engine.createCharacter(
    'test-char-1',
    { x: 10, y: 10 },
    [...components],
    memValues,
    1000,
    'Test',
    0,
  );
  return addCharacter(baseWorld, char);
}

describe('corruptCharacterMemory', () => {
  it('changes the specified number of words', () => {
    // Initial memory: all 0xAAAA at first 100 addresses
    const initial = new Array(100).fill(0xAAAA);
    const world = makeChar(initial);
    const corrupted = corruptCharacterMemory(world, 'test-char-1', 5, 12345);

    const target = corrupted.characters.find((c) => c.id === 'test-char-1')!;
    // Count differences from 0xAAAA in the corrupted memory's first 100 addresses
    // (Memory is much larger than 100 due to MemoryCore size; only the loaded
    // part is set to 0xAAAA, the rest is 0)
    let differences = 0;
    for (let i = 0; i < target.vm.memory.length; i++) {
      const original = i < 100 ? 0xAAAA : 0;
      if (target.vm.memory[i] !== original) differences++;
    }
    // At most 5 differences (could be fewer if random write hits the same value)
    expect(differences).toBeLessThanOrEqual(5);
    expect(differences).toBeGreaterThan(0);
  });

  it('produces deterministic results for the same seed', () => {
    const initial = new Array(100).fill(0xAAAA);
    const world = makeChar(initial);
    const c1 = corruptCharacterMemory(world, 'test-char-1', 10, 99);
    const c2 = corruptCharacterMemory(world, 'test-char-1', 10, 99);
    const t1 = c1.characters.find((c) => c.id === 'test-char-1')!;
    const t2 = c2.characters.find((c) => c.id === 'test-char-1')!;
    expect([...t1.vm.memory]).toEqual([...t2.vm.memory]);
  });

  it('returns world unchanged when target not found', () => {
    const world = makeChar([1, 2, 3]);
    const result = corruptCharacterMemory(world, 'no-such-char', 5, 1);
    expect(result).toBe(world);
  });

  it('does not mutate the original character memory', () => {
    const initial = new Array(100).fill(0xAAAA);
    const world = makeChar(initial);
    const original = world.characters[0];
    const originalMem = [...original.vm.memory];
    corruptCharacterMemory(world, 'test-char-1', 10, 1);
    // Original memory unchanged
    expect([...original.vm.memory]).toEqual(originalMem);
  });
});
