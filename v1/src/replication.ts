import type { Character, ComponentType, Program, World } from './types.js';
import { getCharacter } from './world.js';

// ============================================================
// Replication helpers — used by program.ts executeAction
// ============================================================

/**
 * Check if a character has all required components for self-replication:
 * Processor (for WRITE/ACTIVATE), Assembler (for PROCESS/CRAFT/ASSEMBLE),
 * Harvester (for HARVEST), MemoryCore (for storing Program)
 */
export function canSelfReplicate(character: Character): boolean {
  const required: ComponentType[] = ['Processor', 'Assembler', 'Harvester', 'MemoryCore'];
  return required.every((c) => character.components.includes(c));
}

/**
 * Total raw materials needed for a set of components.
 * Returns { Ore: N, Crystal: M } needed.
 */
export function totalRawMaterialsNeeded(components: readonly ComponentType[]): { Ore: number; Crystal: number } {
  // Metal needed per component
  const metalCost: Record<ComponentType, number> = {
    Frame: 3,
    Actuator: 1,
    Sensor: 0,
    Processor: 0,
    Harvester: 2,
    Assembler: 2,
    MemoryCore: 0,
  };

  // Circuit needed per component
  const circuitCost: Record<ComponentType, number> = {
    Frame: 0,
    Actuator: 1,
    Sensor: 2,
    Processor: 3,
    Harvester: 0,
    Assembler: 1,
    MemoryCore: 2,
  };

  let totalMetal = 0;
  let totalCircuit = 0;
  for (const c of components) {
    totalMetal += metalCost[c];
    totalCircuit += circuitCost[c];
  }

  return {
    Ore: totalMetal * 2,
    Crystal: totalCircuit * 2,
  };
}

/**
 * Deep copy a program — used for WRITE action (quine mechanism).
 * The JSON parse/stringify ensures a true deep copy.
 */
export function deepCopyProgram(program: Program): Program {
  return JSON.parse(JSON.stringify(program));
}

/**
 * Verify that a program was correctly transmitted (deep equality).
 */
export function programsAreEqual(a: Program, b: Program): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Create a modified program by changing the ASSEMBLE action's component list.
 * This demonstrates "evolution" — the daughter gets different body components.
 */
export function evolveProgram(
  program: Program,
  newComponents: readonly ComponentType[],
): Program {
  return {
    rules: program.rules.map((rule) => {
      if (rule.action.op === 'ASSEMBLE') {
        return { ...rule, action: { ...rule.action, components: newComponents } };
      }
      return rule;
    }),
  };
}

/**
 * Get the ASSEMBLE instruction's component list from a program.
 */
export function getAssemblyComponents(program: Program): readonly ComponentType[] | null {
  for (const rule of program.rules) {
    if (rule.action.op === 'ASSEMBLE') {
      return rule.action.components;
    }
  }
  return null;
}

/**
 * Find nearest inactive character adjacent to a character.
 */
export function findAdjacentInactive(
  world: World,
  character: Character,
): Character | undefined {
  return world.characters.find((c) => {
    if (c.id === character.id) return false;
    if (c.program !== null) return false;
    const dx = Math.abs(c.position.x - character.position.x);
    const dy = Math.abs(c.position.y - character.position.y);
    return dx + dy <= 1;
  });
}
