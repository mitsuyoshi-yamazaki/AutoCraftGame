import type { ComponentType } from './types.js';

// ============================================================
// Action energy costs
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
export const ENERGY_COST_REPAIR = 100;
export const ENERGY_COST_DISASSEMBLE = 15;

// ============================================================
// Action failure penalty
// ============================================================
export const ACTION_FAILURE_COST_RATIO = 0.8;

// ============================================================
// Basal metabolism per component type
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
// Energy-based metabolism (excess energy tax)
// ============================================================
export const ENERGY_METABOLISM_THRESHOLD = 3000;
export const ENERGY_METABOLISM_SCALE = 9_000_000;

// ============================================================
// Energy harvesting & transfer
// ============================================================
export const RECHARGE_AMOUNT = 200;
export const ASSEMBLE_ENERGY_TRANSFER = 500;
export const REPAIR_AMOUNT = 200;

// ============================================================
// Durability
// ============================================================
export const FRAME_DURABILITY = 200;

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

// ASSEMBLE total cost includes energy transfer
export function getAssembleTotalCost(): number {
  return ENERGY_COST_ASSEMBLE + ASSEMBLE_ENERGY_TRANSFER;
}

// Failure penalty: ceil(cost * ratio)
export function getFailurePenalty(cost: number): number {
  return Math.ceil(cost * ACTION_FAILURE_COST_RATIO);
}
