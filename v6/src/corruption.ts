/**
 * Memory corruption utility for testing program robustness.
 *
 * Used by CLI (--corrupt-* flags) and GUI (CorruptButton) to intentionally
 * corrupt the memory of a target character. This validates that programs
 * can recover from random memory damage via the CHECKPOINT mechanism.
 */

import type { World, Character } from './types.js';
import { updateCharacter } from './world.js';

const WORD_MASK = 0xFFFF;

/**
 * Corrupt a target character's memory by replacing `count` random words with
 * random values. Uses a simple LCG seeded by `seed` for determinism.
 *
 * @returns updated world (or original if target not found)
 */
export function corruptCharacterMemory(
  world: World,
  characterId: string,
  count: number,
  seed: number,
): World {
  const target = world.characters.find((c) => c.id === characterId);
  if (!target) return world;

  const memSize = target.vm.memory.length;
  if (memSize === 0) return world;

  // Simple LCG (same constants as Numerical Recipes)
  let rng = seed >>> 0;
  const next = (): number => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng;
  };

  const newMemory = [...target.vm.memory];
  for (let i = 0; i < count; i++) {
    const addr = next() % memSize;
    const newValue = next() & WORD_MASK;
    newMemory[addr] = newValue;
  }

  const updated: Character = {
    ...target,
    vm: { ...target.vm, memory: newMemory },
  };
  return updateCharacter(world, updated);
}
