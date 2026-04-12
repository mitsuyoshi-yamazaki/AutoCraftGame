import type { Character, ComponentType, Program, Position, Inventory, Velocity } from './types.js';
import type { GameParams } from './params.js';
import { inventoryTotalCount } from './recipes.js';

// ============================================================
// Component checks (param-independent)
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
// CharacterEngine — param-dependent functions (maker pattern)
// ============================================================
export interface CharacterEngine {
  createCharacter(
    id: string, position: Position, components: ComponentType[],
    program: Program, energy: number, species: string, createdAt: number,
  ): Character;
  createInactiveCharacter(
    id: string, position: Position, components: ComponentType[],
    energy: number, species: string, createdAt: number,
  ): Character;
  calculateEnergyMetabolism(energy: number): number;
  calculateAgingCoefficient(age: number): number;
  calculateBasalMetabolism(character: Character, currentTick: number): number;
  applyBasalMetabolism(character: Character, currentTick: number): void;
  canPayMetabolism(character: Character, currentTick: number): boolean;
  decayDurability(character: Character, starvation: boolean): void;
}

export function createCharacterEngine(params: GameParams): CharacterEngine {
  function createCharacterFn(
    id: string,
    position: Position,
    components: ComponentType[],
    program: Program,
    energy: number,
    species: string,
    createdAt: number,
  ): Character {
    const frameCount = components.filter((c) => c === 'Frame').length;
    const registerCount = components.filter((c) => c === 'Register').length * params.registersPerComponent;
    return {
      id,
      species,
      position,
      velocity: { vx: 0, vy: 0 },
      components: [...components],
      inventory: {},
      durability: frameCount * params.frameDurability,
      energy,
      program,
      senseData: null,
      registers: Array.from({ length: registerCount }, () => null),
      createdAt,
    };
  }

  function createInactiveCharacterFn(
    id: string,
    position: Position,
    components: ComponentType[],
    energy: number,
    species: string,
    createdAt: number,
  ): Character {
    const frameCount = components.filter((c) => c === 'Frame').length;
    const registerCount = components.filter((c) => c === 'Register').length * params.registersPerComponent;
    return {
      id,
      species,
      position,
      velocity: { vx: 0, vy: 0 },
      components: [...components],
      inventory: {},
      durability: frameCount * params.frameDurability,
      energy,
      program: null,
      senseData: null,
      registers: Array.from({ length: registerCount }, () => null),
      createdAt,
    };
  }

  function calculateEnergyMetabolism(energy: number): number {
    const excess = Math.max(0, energy - params.energyMetabolismThreshold);
    return Math.floor((excess * excess) / params.energyMetabolismScale);
  }

  function calculateAgingCoefficient(age: number): number {
    if (age <= params.agingThresholdN) return 1.0;
    const ratio = (age - params.agingThresholdN) / (params.agingThresholdM - params.agingThresholdN);
    return 1 + ratio * ratio;
  }

  function calculateBasalMetabolism(character: Character, currentTick: number): number {
    const baseComponentCost = character.components.reduce(
      (sum, c) => sum + params.metabolism[c],
      0,
    );
    const age = currentTick - character.createdAt;
    const coefficient = calculateAgingCoefficient(age);
    const componentCost = Math.ceil(baseComponentCost * coefficient);
    const itemCount = inventoryTotalCount(character.inventory);
    const inventoryCost = Math.ceil(itemCount * params.inventoryMetabolismPerItem);
    const energyCost = calculateEnergyMetabolism(character.energy);
    return componentCost + inventoryCost + energyCost;
  }

  // MUTABLE: modifies character.energy in place
  function applyBasalMetabolism(character: Character, currentTick: number): void {
    const cost = calculateBasalMetabolism(character, currentTick);
    character.energy = Math.max(0, character.energy - cost);
  }

  function canPayMetabolism(character: Character, currentTick: number): boolean {
    return character.energy >= calculateBasalMetabolism(character, currentTick);
  }

  // MUTABLE: modifies character.durability in place
  function decayDurability(character: Character, starvation: boolean): void {
    const decay = starvation ? params.durabilityDecayStarving : params.durabilityDecayNormal;
    character.durability -= decay;
  }

  return {
    createCharacter: createCharacterFn,
    createInactiveCharacter: createInactiveCharacterFn,
    calculateEnergyMetabolism,
    calculateAgingCoefficient,
    calculateBasalMetabolism,
    applyBasalMetabolism,
    canPayMetabolism,
    decayDurability,
  };
}

// ============================================================
// Register access (MUTABLE)
// ============================================================
export function readRegister(character: Character, index: number): number | null {
  if (index < 0 || index >= character.registers.length) return null;
  return character.registers[index];
}

export function writeRegister(character: Character, index: number, value: number | null): void {
  if (index < 0 || index >= character.registers.length) return;
  character.registers[index] = value;
}
