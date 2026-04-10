/**
 * Seed Definitions — primitive-based initial character definitions for v6.
 *
 * These define characters controlled entirely by the primitive rule system
 * (no Processor, no VM). The goal is to achieve self-replication using
 * only condition→action rules.
 */

import type {
  PrimitiveRule,
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
// Helper: create a rule
// ============================================================
function rule(
  condType: string, arg0: number, arg1: number,
  actType: string, aArg0: number, aArg1: number,
): PrimitiveRule {
  return {
    condition: { type: condType as any, arg0, arg1 },
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

// interactRange is 1.5, so use 1 for "within harvest range" check
// (1 < 1.5, so nearby(type, 1) guarantees a target exists within 1.5)
const INTERACT = 1;

// Total raw materials needed for one child:
// Frame(3M) + Actuator(1M+1C) + Sensor(2C) + Harvester(2M) + Charger(1M+2C) + Assembler(2M+1C)
// = 9 Metal + 6 Circuit = 18 Ore + 12 Crystal
const ORE_TARGET = 18;
const CRYSTAL_TARGET = 12;

const REPLICATOR_RULES: readonly PrimitiveRule[] = [
  // Reflexes (M2) handle: auto-recharge at energy < 200, auto-repair at durability < 300
  // Primitive rules handle: resource gathering, crafting, reproduction

  // Strategy: harvest → process → craft (incremental, with duplicate prevention)
  // The noop-guard pattern prevents crafting components we already have.
  // Order: harvest if nearby, process if raw materials, craft if possible
  // (skipping components already in inventory via noop guards).

  // 1. Reproduce when ready
  rule('can_assemble', 0, 0, 'assemble', 0, 0),

  // 2. Craft components (only if not already in inventory)
  rule('can_craft_missing', CRAFT_FRAME, 0, 'craft', CRAFT_FRAME, 0),
  rule('can_craft_missing', CRAFT_HARVESTER, 0, 'craft', CRAFT_HARVESTER, 0),
  rule('can_craft_missing', CRAFT_ASSEMBLER, 0, 'craft', CRAFT_ASSEMBLER, 0),
  rule('can_craft_missing', CRAFT_ACTUATOR, 0, 'craft', CRAFT_ACTUATOR, 0),
  rule('can_craft_missing', CRAFT_CHARGER, 0, 'craft', CRAFT_CHARGER, 0),
  rule('can_craft_missing', CRAFT_SENSOR, 0, 'craft', CRAFT_SENSOR, 0),

  // 3. Process raw materials
  rule('can_process', 0, 0, 'process', 0, 0),
  rule('can_process', 1, 0, 'process', 1, 0),

  // 4. Harvest nearby resources
  rule('nearby', ORE_NODE, INTERACT, 'harvest', 0, 0),
  rule('nearby', CRYSTAL_NODE, INTERACT, 'harvest', 0, 0),

  // 6. Move: alternate between Ore and Crystal using tick_mod
  rule('tick_mod', 2, 0, 'move_toward', ORE_NODE, 0),     // even ticks: seek Ore
  rule('always', 0, 0, 'move_toward', CRYSTAL_NODE, 0),   // odd ticks: seek Crystal
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
  rule('energy_below', 200, 0, 'recharge', 0, 0),
  rule('durability_below', 300, 0, 'repair', 0, 0),
  rule('nearby', ORE_NODE, INTERACT, 'harvest', 0, 0),
  rule('nearby', CRYSTAL_NODE, INTERACT, 'harvest', 0, 0),
  rule('nearby', ENERGY_NODE, INTERACT, 'recharge', 0, 0),
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
