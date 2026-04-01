import type { Character, ComponentType, Program, Position, Inventory } from './types.js';
import { FRAME_DURABILITY, METABOLISM, INVENTORY_METABOLISM_PER_ITEM } from './constants.js';
import { inventoryTotalCount } from './recipes.js';

// ============================================================
// Create a new active character (with program)
// ============================================================
export function createCharacter(
  id: string,
  position: Position,
  components: readonly ComponentType[],
  program: Program,
  energy: number,
): Character {
  const frameCount = components.filter((c) => c === 'Frame').length;
  return {
    id,
    position,
    components,
    inventory: {},
    durability: frameCount * FRAME_DURABILITY,
    energy,
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
  energy: number,
): Character {
  const frameCount = components.filter((c) => c === 'Frame').length;
  return {
    id,
    position,
    components,
    inventory: {},
    durability: frameCount * FRAME_DURABILITY,
    energy,
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
// Calculate basal metabolism from components + inventory
// ============================================================
export function calculateBasalMetabolism(character: Character): number {
  const componentCost = character.components.reduce(
    (sum, c) => sum + METABOLISM[c],
    0,
  );
  const itemCount = inventoryTotalCount(character.inventory);
  const inventoryCost = Math.ceil(itemCount * INVENTORY_METABOLISM_PER_ITEM);
  return componentCost + inventoryCost;
}

// ============================================================
// Apply basal metabolism
// ============================================================
export function applyBasalMetabolism(character: Character): Character {
  const cost = calculateBasalMetabolism(character);
  return { ...character, energy: character.energy - cost };
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
// State updaters
// ============================================================
export function setInventory(character: Character, inventory: Inventory): Character {
  return { ...character, inventory };
}

export function setPosition(character: Character, position: Position): Character {
  return { ...character, position };
}

export function setEnergy(character: Character, energy: number): Character {
  return { ...character, energy };
}
