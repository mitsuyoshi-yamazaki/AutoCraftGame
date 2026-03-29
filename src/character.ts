import type { Character, ComponentType, Program, Position, Inventory } from './types.js';
import { FRAME_DURABILITY } from './recipes.js';

// ============================================================
// Create a new active character (with program)
// ============================================================
export function createCharacter(
  id: string,
  position: Position,
  components: readonly ComponentType[],
  program: Program,
): Character {
  const frameCount = components.filter((c) => c === 'Frame').length;
  return {
    id,
    position,
    components,
    inventory: {},
    durability: frameCount * FRAME_DURABILITY,
    program,
    senseData: null,
  };
}

// ============================================================
// Create an inactive character (no program — needs WRITE + ACTIVATE)
// ============================================================
export function createInactiveCharacter(
  id: string,
  position: Position,
  components: readonly ComponentType[],
): Character {
  const frameCount = components.filter((c) => c === 'Frame').length;
  return {
    id,
    position,
    components,
    inventory: {},
    durability: frameCount * FRAME_DURABILITY,
    program: null,
    senseData: null,
  };
}

// ============================================================
// Check if character has a specific component
// ============================================================
export function hasComponent(character: Character, component: ComponentType): boolean {
  return character.components.includes(component);
}

// ============================================================
// Check if character is active (has a program)
// ============================================================
export function isActive(character: Character): boolean {
  return character.program !== null;
}

// ============================================================
// Apply durability decay
// ============================================================
export function decayDurability(character: Character): Character {
  return { ...character, durability: character.durability - 1 };
}

// ============================================================
// Check if character is dead
// ============================================================
export function isDead(character: Character): boolean {
  return character.durability <= 0;
}

// ============================================================
// Update inventory
// ============================================================
export function setInventory(character: Character, inventory: Inventory): Character {
  return { ...character, inventory };
}

// ============================================================
// Update position
// ============================================================
export function setPosition(character: Character, position: Position): Character {
  return { ...character, position };
}

// ============================================================
// Set program (for WRITE action)
// ============================================================
export function setProgram(character: Character, program: Program): Character {
  return { ...character, program };
}

// ============================================================
// Activate character (set program to make it active)
// ============================================================
export function activateCharacter(character: Character, program: Program): Character {
  return { ...character, program };
}
