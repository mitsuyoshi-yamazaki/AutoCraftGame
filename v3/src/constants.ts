import type { ComponentType } from './types.js';

// ============================================================
// Action energy costs (same as v2)
// ============================================================
export const ENERGY_COST_MOVE = 10;
export const ENERGY_COST_HARVEST = 10;
export const ENERGY_COST_RECHARGE = 5;
export const ENERGY_COST_PROCESS = 20;
export const ENERGY_COST_CRAFT = 20;
export const ENERGY_COST_ASSEMBLE = 50;
export const ENERGY_COST_WRITE = 10;
export const ENERGY_COST_ACTIVATE = 10;
export const ENERGY_COST_SENSE = 5;
export const ENERGY_COST_REPAIR = 200;
export const ENERGY_COST_DISASSEMBLE = 15;

// ============================================================
// Action failure penalty (same as v2)
// ============================================================
export const ACTION_FAILURE_COST_RATIO = 0.8;

// ============================================================
// Basal metabolism per component type (same as v2)
// ============================================================
export const METABOLISM: Readonly<Record<ComponentType, number>> = {
  Frame: 1,
  Actuator: 2,
  Sensor: 2,
  Processor: 3,
  Harvester: 2,
  Assembler: 3,
  Disassembler: 2,
  Charger: 2,
  MemoryCore: 1,
};

export const INVENTORY_METABOLISM_PER_ITEM = 1;

// ============================================================
// Energy-based metabolism (same as v2)
// ============================================================
export const ENERGY_METABOLISM_THRESHOLD = 3000;
export const ENERGY_METABOLISM_SCALE = 9_000_000;

// ============================================================
// Energy harvesting & transfer (same as v2)
// ============================================================
export const RECHARGE_AMOUNT = 200;
export const ASSEMBLE_ENERGY_TRANSFER = 500;
export const REPAIR_AMOUNT = 100;

// ============================================================
// Durability (same as v2)
// ============================================================
export const FRAME_DURABILITY = 300;

// ============================================================
// Physics constants (v3: new)
// ============================================================
export const MOVE_FORCE = 80.0;
export const FRICTION_COEFFICIENT = 0.8;
export const COLLISION_STIFFNESS = 200.0;
export const VELOCITY_CLAMP_THRESHOLD = 0.01;

// ============================================================
// Object radii (v3: new)
// ============================================================
export const CHARACTER_RADIUS = 0.4;
export const RESOURCE_NODE_RADIUS = 0.4;
export const ENERGY_NODE_RADIUS = 0.4;
export const REMAINS_RADIUS = 0.3;

// ============================================================
// Interaction & spawn distances (v3: new)
// ============================================================
export const INTERACT_RANGE = 1.5;
export const SPAWN_DISTANCE = 1.2;
export const SENSE_RANGE = 10.0;

// ============================================================
// Action cost lookup
// ============================================================
export function getActionEnergyCost(op: string): number {
  switch (op) {
    case 'NOOP': return 0;
    case 'MOVE': return ENERGY_COST_MOVE;
    case 'HARVEST': return ENERGY_COST_HARVEST;
    case 'RECHARGE': return ENERGY_COST_RECHARGE;
    case 'PROCESS': return ENERGY_COST_PROCESS;
    case 'CRAFT': return ENERGY_COST_CRAFT;
    case 'ASSEMBLE': return ENERGY_COST_ASSEMBLE;
    case 'WRITE': return ENERGY_COST_WRITE;
    case 'ACTIVATE': return ENERGY_COST_ACTIVATE;
    case 'SENSE': return ENERGY_COST_SENSE;
    case 'REPAIR': return ENERGY_COST_REPAIR;
    case 'DISASSEMBLE': return ENERGY_COST_DISASSEMBLE;
    default: return 0;
  }
}

export function getAssembleTotalCost(): number {
  return ENERGY_COST_ASSEMBLE + ASSEMBLE_ENERGY_TRANSFER;
}

export function getFailurePenalty(cost: number): number {
  return Math.ceil(cost * ACTION_FAILURE_COST_RATIO);
}
