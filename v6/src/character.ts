import type { Character, ComponentType, VmState, Position, Inventory, Velocity } from './types.js';
import type { GameParams } from './params.js';
import { inventoryTotalCount } from './recipes.js';

// ============================================================
// Component checks (param-independent)
// ============================================================
export function hasComponent(character: Character, component: ComponentType): boolean {
  return character.components.includes(component);
}

export function isActive(character: Character): boolean {
  return character.vm.active;
}

export function isDead(character: Character): boolean {
  return character.durability <= 0;
}

// ============================================================
// VM state creation helpers
// ============================================================
function createActiveVmState(memorySize: number, program: readonly number[]): VmState {
  const memory = new Array<number>(memorySize).fill(0);
  for (let i = 0; i < program.length && i < memorySize; i++) {
    memory[i] = program[i];
  }
  return {
    memory,
    registers: [0, 0, 0, 0, 0, 0, 0, 0],
    pc: 0,
    cp: 0,
    cpSet: false,
    active: true,
    localIdTable: new Map(),
    localIdCounter: 0,
  };
}

function createInactiveVmState(memorySize: number): VmState {
  return {
    memory: new Array<number>(memorySize).fill(0),
    registers: [0, 0, 0, 0, 0, 0, 0, 0],
    pc: 0,
    cp: 0,
    cpSet: false,
    active: false,
    localIdTable: new Map(),
    localIdCounter: 0,
  };
}

// ============================================================
// CharacterEngine — param-dependent functions (maker pattern)
// ============================================================
export interface CharacterEngine {
  createCharacter(
    id: string, position: Position, components: readonly ComponentType[],
    program: readonly number[], energy: number, species: string, createdAt: number,
  ): Character;
  createInactiveCharacter(
    id: string, position: Position, components: readonly ComponentType[],
    energy: number, species: string, createdAt: number,
  ): Character;
  calculateEnergyMetabolism(energy: number): number;
  calculateAgingCoefficient(age: number): number;
  calculateBasalMetabolism(character: Character, currentTick: number): number;
  applyBasalMetabolism(character: Character, currentTick: number): Character;
  canPayMetabolism(character: Character, currentTick: number): boolean;
  decayDurability(character: Character, starvation: boolean): Character;
}

export function createCharacterEngine(params: GameParams): CharacterEngine {
  function getMemorySize(components: readonly ComponentType[]): number {
    const memoryCoreCount = components.filter((c) => c === 'MemoryCore').length;
    return memoryCoreCount * params.memoryCoreWords;
  }

  function createCharacterFn(
    id: string,
    position: Position,
    components: readonly ComponentType[],
    program: readonly number[],
    energy: number,
    species: string,
    createdAt: number,
  ): Character {
    const frameCount = components.filter((c) => c === 'Frame').length;
    const memorySize = getMemorySize(components);
    return {
      id,
      species,
      position,
      velocity: { vx: 0, vy: 0 },
      components,
      inventory: {},
      durability: frameCount * params.frameDurability,
      energy,
      createdAt,
      vm: createActiveVmState(memorySize, program),
      idleTickCount: 0,
      instrLimitTickCount: 0,
    };
  }

  function createInactiveCharacterFn(
    id: string,
    position: Position,
    components: readonly ComponentType[],
    energy: number,
    species: string,
    createdAt: number,
  ): Character {
    const frameCount = components.filter((c) => c === 'Frame').length;
    const memorySize = getMemorySize(components);
    return {
      id,
      species,
      position,
      velocity: { vx: 0, vy: 0 },
      components,
      inventory: {},
      durability: frameCount * params.frameDurability,
      energy,
      createdAt,
      vm: createInactiveVmState(memorySize),
      idleTickCount: 0,
      instrLimitTickCount: 0,
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

  function applyBasalMetabolism(character: Character, currentTick: number): Character {
    const cost = calculateBasalMetabolism(character, currentTick);
    return { ...character, energy: Math.max(0, character.energy - cost) };
  }

  function canPayMetabolism(character: Character, currentTick: number): boolean {
    return character.energy >= calculateBasalMetabolism(character, currentTick);
  }

  function decayDurability(character: Character, starvation: boolean): Character {
    const decay = starvation ? params.durabilityDecayStarving : params.durabilityDecayNormal;
    return { ...character, durability: character.durability - decay };
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

export function setVmState(character: Character, vm: VmState): Character {
  return { ...character, vm };
}

// ============================================================
// M3 (apoptosis) — counter updates and judgment
// ============================================================

/**
 * Update the apoptosis counters for a character based on this tick's outcomes.
 * - idleTickCount: incremented if no action was reserved this tick (reflexes
 *   counted as actions); reset to 0 otherwise.
 * - instrLimitTickCount: incremented if the VM hit instructionsPerTick this
 *   tick; reset to 0 if HALT was reached normally.
 */
export function updateApoptosisCounters(
  character: Character,
  hadAction: boolean,
  hitInstrLimit: boolean,
): Character {
  return {
    ...character,
    idleTickCount: hadAction ? 0 : character.idleTickCount + 1,
    instrLimitTickCount: hitInstrLimit ? character.instrLimitTickCount + 1 : 0,
  };
}

/**
 * Returns true if the character has reached the apoptosis threshold and
 * should be marked for death this tick.
 */
export function shouldApoptose(
  character: Character,
  idleLimit: number,
  instrLimitLimit: number,
): boolean {
  return (
    character.idleTickCount >= idleLimit ||
    character.instrLimitTickCount >= instrLimitLimit
  );
}
