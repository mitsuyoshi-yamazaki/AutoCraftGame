import type { Character, ComponentType, Program, Position, Inventory, Velocity } from './types.js';
import {
  FRAME_DURABILITY,
  METABOLISM,
  INVENTORY_METABOLISM_PER_ITEM,
  ENERGY_METABOLISM_THRESHOLD,
  ENERGY_METABOLISM_SCALE,
  REGISTERS_PER_COMPONENT,
} from './constants.js';
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
  species: string,
): Character {
  const frameCount = components.filter((c) => c === 'Frame').length;
  const registerCount = components.filter((c) => c === 'Register').length * REGISTERS_PER_COMPONENT;
  return {
    id,
    species,
    position,
    velocity: { vx: 0, vy: 0 },
    components,
    inventory: {},
    durability: frameCount * FRAME_DURABILITY,
    energy,
    program,
    senseData: null,
    registers: Array.from({ length: registerCount }, () => null),
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
  species: string,
): Character {
  const frameCount = components.filter((c) => c === 'Frame').length;
  const registerCount = components.filter((c) => c === 'Register').length * REGISTERS_PER_COMPONENT;
  return {
    id,
    species,
    position,
    velocity: { vx: 0, vy: 0 },
    components,
    inventory: {},
    durability: frameCount * FRAME_DURABILITY,
    energy,
    program: null,
    senseData: null,
    registers: Array.from({ length: registerCount }, () => null),
  };
}

// ============================================================
// Component checks
// ============================================================
export function hasComponent(character: Character, component: ComponentType): boolean {
  return character.components.includes(component);
}

export function isActive(character: Character): boolean {
  return character.program !== null;
}

export function isDead(character: Character): boolean {
  return character.durability <= 0;
}

// ============================================================
// Metabolism (same as v2)
// ============================================================
export function calculateEnergyMetabolism(energy: number): number {
  const excess = Math.max(0, energy - ENERGY_METABOLISM_THRESHOLD);
  return Math.floor((excess * excess) / ENERGY_METABOLISM_SCALE);
}

export function calculateBasalMetabolism(character: Character): number {
  const componentCost = character.components.reduce(
    (sum, c) => sum + METABOLISM[c],
    0,
  );
  const itemCount = inventoryTotalCount(character.inventory);
  const inventoryCost = Math.ceil(itemCount * INVENTORY_METABOLISM_PER_ITEM);
  const energyCost = calculateEnergyMetabolism(character.energy);
  return componentCost + inventoryCost + energyCost;
}

export function applyBasalMetabolism(character: Character): Character {
  const cost = calculateBasalMetabolism(character);
  return { ...character, energy: Math.max(0, character.energy - cost) };
}

export function canPayMetabolism(character: Character): boolean {
  return character.energy >= calculateBasalMetabolism(character);
}

export function decayDurability(character: Character, starvation: boolean): Character {
  const decay = starvation ? 2 : 1;
  return { ...character, durability: character.durability - decay };
}

// ============================================================
// Register access
// ============================================================
export function readRegister(character: Character, index: number): number | null {
  if (index < 0 || index >= character.registers.length) return null;
  return character.registers[index];
}

export function writeRegister(character: Character, index: number, value: number | null): Character {
  if (index < 0 || index >= character.registers.length) return character;
  const registers = [...character.registers];
  registers[index] = value;
  return { ...character, registers };
}

// ============================================================
// State updaters
// ============================================================
export function setPosition(character: Character, position: Position): Character {
  return { ...character, position };
}

export function setVelocity(character: Character, velocity: Velocity): Character {
  return { ...character, velocity };
}

export function setEnergy(character: Character, energy: number): Character {
  return { ...character, energy };
}

export function setInventory(character: Character, inventory: Inventory): Character {
  return { ...character, inventory };
}
