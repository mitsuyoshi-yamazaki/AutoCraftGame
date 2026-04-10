/**
 * Seed Definitions — primitive-based initial character definitions for v6.
 *
 * These define characters controlled entirely by the primitive rule system
 * (no Processor, no VM). The goal is to achieve self-replication using
 * only condition→action rules.
 */

import type {
  PrimitiveRule,
  PrimitiveCondition,
  AssemblyTemplate,
  PrimitiveDefinition,
  ComponentType,
} from './types.js';

// ============================================================
// Item indices (same as ITEM_NAMES in primitives.ts)
// ============================================================
const ORE = 0;
const CRYSTAL = 1;
const METAL = 2;
const CIRCUIT = 3;
const FRAME = 4;
const ACTUATOR = 5;
const HARVESTER = 6;
const CHARGER = 7;
const ASSEMBLER = 8;
// const PROCESSOR = 9;
const SENSOR = 10;
// const DISASSEMBLER = 11;
// const MEMORYCORE = 12;

// ============================================================
// NearbyTargetType indices (same as NEARBY_TYPES in primitives.ts)
// ============================================================
const ORE_NODE = 0;
const CRYSTAL_NODE = 1;
const ENERGY_NODE = 2;

// ============================================================
// Component type indices for CRAFT (same as COMPONENT_ORDER in io.ts)
// ============================================================
const CRAFT_FRAME = 0;
const CRAFT_ACTUATOR = 1;
const CRAFT_HARVESTER = 2;
const CRAFT_CHARGER = 3;
const CRAFT_ASSEMBLER = 4;
// const CRAFT_PROCESSOR = 5;
const CRAFT_SENSOR = 6;

// ============================================================
// Helpers: create conditions and rules
// ============================================================
function cond(type: string, arg0 = 0, arg1 = 0): PrimitiveCondition {
  return { type: type as any, arg0, arg1 };
}

function and(...subs: PrimitiveCondition[]): PrimitiveCondition {
  return { type: 'and', arg0: 0, arg1: 0, sub: subs };
}

function not(sub: PrimitiveCondition): PrimitiveCondition {
  return { type: 'not', arg0: 0, arg1: 0, sub: [sub] };
}

function rule(
  condType: string, arg0: number, arg1: number,
  actType: string, aArg0: number, aArg1: number,
): PrimitiveRule {
  return {
    condition: { type: condType as any, arg0, arg1 },
    action: { type: actType as any, arg0: aArg0, arg1: aArg1 },
  };
}

function ruleC(condition: PrimitiveCondition, actType: string, aArg0 = 0, aArg1 = 0): PrimitiveRule {
  return {
    condition,
    action: { type: actType as any, arg0: aArg0, arg1: aArg1 },
  };
}

// ============================================================
// Minimal Self-Replicator
// ============================================================
// Components: Frame, Actuator, Sensor, Harvester, Charger, Assembler
// Child needs the same components.
// Recipe totals: 9 Metal + 6 Circuit = 18 Ore + 12 Crystal
//
// Strategy:
//   1. Recharge when energy low
//   2. Repair when durability low
//   3. If all child components ready → ASSEMBLE
//   4. Craft components when materials available (try each, fail is ok)
//   5. Process raw materials
//   6. Harvest nearby resources
//   7. Move toward resources
//
// The "can_assemble" condition checks all needed components at once.
// For crafting, we try each recipe — failure costs penalty energy but
// primitive characters accept this tradeoff.

const REPLICATOR_COMPONENTS: readonly ComponentType[] = [
  'Frame', 'Actuator', 'Sensor', 'Harvester', 'Charger', 'Assembler',
];

const INTERACT = 1;  // nearby check range (< interactRange 1.5)
const NEED_ORE = 18;     // 9 Metal × 2 Ore/Metal
const NEED_CRYSTAL = 12; // 6 Circuit × 2 Crystal/Circuit

const REPLICATOR_RULES: readonly PrimitiveRule[] = [
  // Reflexes (M2) handle: auto-recharge at energy < 200, auto-repair at durability < 300

  // 0. Energy management: recharge before assembling, and survive
  ruleC(and(cond('can_assemble', 0), cond('energy_below', 1500), cond('nearby', ENERGY_NODE, INTERACT)), 'recharge'),
  ruleC(and(cond('can_assemble', 0), cond('energy_below', 1500)), 'move_toward', ENERGY_NODE),
  ruleC(and(cond('energy_below', 300), cond('nearby', ENERGY_NODE, INTERACT)), 'recharge'),
  rule('energy_below', 300, 0, 'move_toward', ENERGY_NODE, 0),

  // 1. Reproduce when ready AND have enough energy (ASSEMBLE costs ~1050)
  ruleC(and(cond('can_assemble', 0), cond('energy_above', 1200)), 'assemble'),

  // 2. Craft (only if missing and materials available)
  rule('can_craft_missing', CRAFT_FRAME, 0, 'craft', CRAFT_FRAME, 0),
  rule('can_craft_missing', CRAFT_HARVESTER, 0, 'craft', CRAFT_HARVESTER, 0),
  rule('can_craft_missing', CRAFT_ASSEMBLER, 0, 'craft', CRAFT_ASSEMBLER, 0),
  rule('can_craft_missing', CRAFT_ACTUATOR, 0, 'craft', CRAFT_ACTUATOR, 0),
  rule('can_craft_missing', CRAFT_CHARGER, 0, 'craft', CRAFT_CHARGER, 0),
  rule('can_craft_missing', CRAFT_SENSOR, 0, 'craft', CRAFT_SENSOR, 0),

  // 3. Process in small batches (only when energy is sufficient)
  ruleC(and(cond('energy_above', 300), cond('inventory_has', ORE, 6), cond('can_process', 0)), 'process', 0),
  ruleC(and(cond('energy_above', 300), cond('inventory_has', CRYSTAL, 6), cond('can_process', 1)), 'process', 1),

  // 4. Recharge when energy low AND near EnergyNode
  ruleC(and(cond('energy_below', 500), cond('nearby', ENERGY_NODE, INTERACT)), 'recharge'),

  // 5. Harvest — only when we still need the processed form too
  ruleC(and(cond('nearby', ORE_NODE, INTERACT), cond('inventory_below', ORE, NEED_ORE), cond('inventory_below', METAL, 9)), 'harvest'),
  ruleC(and(cond('nearby', CRYSTAL_NODE, INTERACT), cond('inventory_below', CRYSTAL, NEED_CRYSTAL), cond('inventory_below', CIRCUIT, 6)), 'harvest'),

  // 6. Move: seek resources based on what we still need
  // Check remaining components and their material needs:
  // Assembler(M2+C1), Actuator(M1+C1), Charger(M1+C2) need both Metal and Circuit
  // If Metal is low, seek Ore; if Circuit is low, seek Crystal
  // Alternate between Ore and Crystal to gather both efficiently
  ruleC(and(cond('inventory_below', METAL, 3), cond('inventory_below', ORE, 6)), 'move_toward', ORE_NODE),
  ruleC(and(cond('inventory_below', CIRCUIT, 3), cond('inventory_below', CRYSTAL, 6)), 'move_toward', CRYSTAL_NODE),
  rule('inventory_below', ORE, NEED_ORE, 'move_toward', ORE_NODE, 0),
  rule('inventory_below', CRYSTAL, NEED_CRYSTAL, 'move_toward', CRYSTAL_NODE, 0),

  // 7. Seek energy when low
  rule('energy_below', 500, 0, 'move_toward', ENERGY_NODE, 0),

  // 8. Process leftover raw materials (after both targets met, some may remain)
  rule('can_process', 0, 0, 'process', 0, 0),
  rule('can_process', 1, 0, 'process', 1, 0),

  // 9. Default: start next cycle
  rule('always', 0, 0, 'move_toward', ORE_NODE, 0),
];

// Self-referential template: child gets same rules and templates
function createReplicatorTemplate(): AssemblyTemplate {
  const template: AssemblyTemplate = {
    components: [...REPLICATOR_COMPONENTS],
    rules: REPLICATOR_RULES,
    templates: [],  // will be patched below
  };
  // Self-reference: the template's templates array contains itself
  // We use Object.assign to create the circular reference
  const selfRef: AssemblyTemplate = {
    ...template,
    templates: [template],
  };
  return { ...selfRef, templates: [selfRef] };
}

export const PRIMITIVE_REPLICATOR: PrimitiveDefinition = {
  name: 'PrimitiveReplicator',
  components: [...REPLICATOR_COMPONENTS],
  rules: REPLICATOR_RULES,
  templates: [createReplicatorTemplate()],
  count: 10,
};

// ============================================================
// Gatherer (non-replicating, just survives)
// ============================================================
const GATHERER_RULES: readonly PrimitiveRule[] = [
  ruleC(and(cond('energy_below', 500), cond('nearby', ENERGY_NODE, INTERACT)), 'recharge'),
  rule('nearby', ORE_NODE, INTERACT, 'harvest', 0, 0),
  rule('nearby', CRYSTAL_NODE, INTERACT, 'harvest', 0, 0),
  rule('energy_below', 500, 0, 'move_toward', ENERGY_NODE, 0),
  rule('always', 0, 0, 'move_toward', ORE_NODE, 0),
];

export const PRIMITIVE_GATHERER: PrimitiveDefinition = {
  name: 'PrimitiveGatherer',
  components: ['Frame', 'Actuator', 'Sensor', 'Harvester', 'Charger'],
  rules: GATHERER_RULES,
  templates: [],
  count: 5,
};

// ============================================================
// All seed definitions
// ============================================================
export const ALL_PRIMITIVE_SEEDS: readonly PrimitiveDefinition[] = [
  PRIMITIVE_REPLICATOR,
  PRIMITIVE_GATHERER,
];
