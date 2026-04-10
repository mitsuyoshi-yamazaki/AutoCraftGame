/**
 * Primitive Evaluator (v6) — evaluates rule-based control for characters
 * without a Processor.
 *
 * Each tick, rules are evaluated top-to-bottom. The first rule whose
 * condition is true produces an ActionReservation. Only one action is
 * produced per tick (a deliberate limitation vs. VM-based characters).
 */

import type {
  Character,
  World,
  PrimitiveRule,
  PrimitiveCondition,
  PrimitiveAction,
  NearbyTargetType,
  ComponentType,
  AssemblyTemplate,
} from './types.js';
import type { GameParams } from './params.js';
import type { ActionReservation } from './io.js';
import type { SpatialGrid } from './spatial-grid.js';
import { queryRange } from './spatial-grid.js';
import { hasComponent, isControlled } from './character.js';

// ============================================================
// Item type mapping (same order as io.ts INVENTORY_ITEM_NAMES)
// ============================================================
const ITEM_NAMES: readonly string[] = [
  'Ore', 'Crystal', 'Metal', 'Circuit',
  'Frame', 'Actuator', 'Harvester', 'Charger',
  'Assembler', 'Processor', 'Sensor', 'Disassembler', 'MemoryCore',
];

const NEARBY_TYPES: readonly NearbyTargetType[] = [
  'OreNode', 'CrystalNode', 'EnergyNode',
  'Character', 'InactiveCharacter', 'Remains',
];

const COMPONENT_ORDER: readonly ComponentType[] = [
  'Frame', 'Actuator', 'Harvester', 'Charger',
  'Assembler', 'Processor', 'Sensor', 'Disassembler', 'MemoryCore',
];

// ============================================================
// Distance helper
// ============================================================
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

// ============================================================
// PrimitiveEngine
// ============================================================
export interface PrimitiveEngine {
  evaluate(
    character: Character,
    world: World,
    grid: SpatialGrid,
  ): readonly ActionReservation[];
}

export function createPrimitiveEngine(params: GameParams): PrimitiveEngine {

  function evaluate(
    character: Character,
    world: World,
    grid: SpatialGrid,
  ): readonly ActionReservation[] {
    for (const rule of character.primitiveRules) {
      if (checkCondition(rule.condition, character, world, grid)) {
        // 'noop' action: skip this rule and continue evaluating
        if (rule.action.type === 'noop') continue;
        const reservation = buildReservation(rule.action, character, world, grid);
        return reservation ? [reservation] : [];
      }
    }
    return [];
  }

  // ============================================================
  // Condition evaluation
  // ============================================================
  function checkCondition(
    cond: PrimitiveCondition,
    character: Character,
    world: World,
    grid: SpatialGrid,
  ): boolean {
    switch (cond.type) {
      case 'always':
        return true;
      case 'energy_below':
        return character.energy < cond.arg0;
      case 'energy_above':
        return character.energy >= cond.arg0;
      case 'durability_below':
        return character.durability < cond.arg0;
      case 'inventory_has': {
        const itemName = ITEM_NAMES[cond.arg0 % ITEM_NAMES.length] ?? 'Ore';
        return (character.inventory[itemName] ?? 0) >= cond.arg1;
      }
      case 'inventory_below': {
        const itemName = ITEM_NAMES[cond.arg0 % ITEM_NAMES.length] ?? 'Ore';
        return (character.inventory[itemName] ?? 0) < cond.arg1;
      }
      case 'nearby': {
        const targetType = NEARBY_TYPES[cond.arg0 % NEARBY_TYPES.length] ?? 'OreNode';
        const range = Math.min(cond.arg1 || params.senseRange, params.senseRange);
        return hasNearby(character, world, grid, targetType, range);
      }
      case 'not_nearby': {
        const targetType = NEARBY_TYPES[cond.arg0 % NEARBY_TYPES.length] ?? 'OreNode';
        const range = Math.min(cond.arg1 || params.senseRange, params.senseRange);
        return !hasNearby(character, world, grid, targetType, range);
      }
      case 'tick_mod': {
        const divisor = Math.max(1, cond.arg0);
        return (world.tick % divisor) === (cond.arg1 % divisor);
      }
      case 'can_assemble': {
        const templateIndex = cond.arg0;
        if (templateIndex < 0 || templateIndex >= character.assemblyTemplates.length) return false;
        const template = character.assemblyTemplates[templateIndex];
        const required: Record<string, number> = {};
        for (const c of template.components) required[c] = (required[c] ?? 0) + 1;
        return Object.entries(required).every(
          ([item, count]) => (character.inventory[item] ?? 0) >= count,
        );
      }
      case 'can_craft': {
        const componentIdx = cond.arg0 % COMPONENT_ORDER.length;
        const componentName = COMPONENT_ORDER[componentIdx];
        const recipe = params.craftRecipes.find(r => r.output === componentName);
        if (!recipe) return false;
        return Object.entries(recipe.inputs).every(
          ([item, count]) => (character.inventory[item] ?? 0) >= count,
        );
      }
      case 'can_craft_missing': {
        // Can craft AND don't already have it in inventory
        const componentIdx2 = cond.arg0 % COMPONENT_ORDER.length;
        const componentName2 = COMPONENT_ORDER[componentIdx2];
        if ((character.inventory[componentName2] ?? 0) > 0) return false;
        const recipe2 = params.craftRecipes.find(r => r.output === componentName2);
        if (!recipe2) return false;
        return Object.entries(recipe2.inputs).every(
          ([item, count]) => (character.inventory[item] ?? 0) >= count,
        );
      }
      case 'can_process': {
        // arg0: 0=Metal (needs Ore×2), 1=Circuit (needs Crystal×2)
        const recipeIdx = cond.arg0 % params.processRecipes.length;
        const recipe = params.processRecipes[recipeIdx];
        return Object.entries(recipe.inputs).every(
          ([item, count]) => (character.inventory[item] ?? 0) >= count,
        );
      }
      default:
        return false;
    }
  }

  function hasNearby(
    character: Character,
    world: World,
    grid: SpatialGrid,
    targetType: NearbyTargetType,
    range: number,
  ): boolean {
    const nearby = queryRange(grid, character.position, range);
    for (const entry of nearby) {
      if (entry.id === character.id) continue;
      if (matchesType(entry.kind, targetType, entry.id, world)) {
        if (dist(character.position, entry.position) <= range) return true;
      }
    }
    return false;
  }

  function matchesType(
    kind: string,
    targetType: NearbyTargetType,
    id: string,
    world: World,
  ): boolean {
    switch (targetType) {
      case 'OreNode':
        if (kind !== 'resourceNode') return false;
        return world.resourceNodes.some(n => n.id === id && n.type === 'OreNode' && n.remaining > 0);
      case 'CrystalNode':
        if (kind !== 'resourceNode') return false;
        return world.resourceNodes.some(n => n.id === id && n.type === 'CrystalNode' && n.remaining > 0);
      case 'EnergyNode':
        if (kind !== 'energyNode') return false;
        return world.energyNodes.some(n => n.id === id && n.stored > 0);
      case 'Character':
        return kind === 'character' && world.characters.some(c => c.id === id && isControlled(c));
      case 'InactiveCharacter':
        return kind === 'character' && world.characters.some(c => c.id === id && !isControlled(c));
      case 'Remains':
        return kind === 'remains';
    }
  }

  // ============================================================
  // Reservation building
  // ============================================================
  function buildReservation(
    action: PrimitiveAction,
    character: Character,
    world: World,
    grid: SpatialGrid,
  ): ActionReservation | null {
    switch (action.type) {
      case 'move_toward':
        return buildMoveToward(action, character, world, grid);
      case 'move_away':
        return buildMoveAway(action, character, world, grid);
      case 'move_random':
        return buildMoveRandom(character, world);
      case 'harvest':
        return { op: 'HARVEST', slotIndex: 0, targetLocalId: 0 };
      case 'recharge':
        return { op: 'RECHARGE', slotIndex: 0, targetLocalId: 0 };
      case 'process':
        return { op: 'PROCESS', slotIndex: 0, recipe: action.arg0 % 2 };
      case 'craft':
        return { op: 'CRAFT', slotIndex: 0, componentType: action.arg0 % COMPONENT_ORDER.length };
      case 'assemble':
        return buildAssemble(action, character);
      case 'repair':
        return { op: 'REPAIR', slotIndex: 0 };
      case 'disassemble':
        return { op: 'DISASSEMBLE', slotIndex: 0, targetLocalId: 0 };
      case 'noop':
        return null;
      default:
        return null;
    }
  }

  function findNearestOfType(
    character: Character,
    world: World,
    grid: SpatialGrid,
    targetType: NearbyTargetType,
  ): { x: number; y: number } | null {
    if (!hasComponent(character, 'Sensor')) return null;
    const nearby = queryRange(grid, character.position, params.senseRange);
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const entry of nearby) {
      if (entry.id === character.id) continue;
      if (!matchesType(entry.kind, targetType, entry.id, world)) continue;
      const d = dist(character.position, entry.position);
      if (d > params.senseRange) continue;
      if (d < bestDist) {
        bestDist = d;
        best = entry.position;
      }
    }
    return best;
  }

  function angleTo(from: { x: number; y: number }, to: { x: number; y: number }): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const rad = Math.atan2(dy, dx);
    const deg = (rad * 180) / Math.PI;
    return ((Math.round(deg) % 360) + 360) % 360;
  }

  function buildMoveToward(
    action: PrimitiveAction,
    character: Character,
    world: World,
    grid: SpatialGrid,
  ): ActionReservation {
    const targetType = NEARBY_TYPES[action.arg0 % NEARBY_TYPES.length] ?? 'OreNode';
    const target = findNearestOfType(character, world, grid, targetType);
    if (target) {
      const direction = angleTo(character.position, target);
      return { op: 'MOVE', slotIndex: 0, direction };
    }
    // Fallback to random move
    return buildMoveRandom(character, world);
  }

  function buildMoveAway(
    action: PrimitiveAction,
    character: Character,
    world: World,
    grid: SpatialGrid,
  ): ActionReservation {
    const targetType = NEARBY_TYPES[action.arg0 % NEARBY_TYPES.length] ?? 'OreNode';
    const target = findNearestOfType(character, world, grid, targetType);
    if (target) {
      const direction = (angleTo(character.position, target) + 180) % 360;
      return { op: 'MOVE', slotIndex: 0, direction };
    }
    return buildMoveRandom(character, world);
  }

  function buildMoveRandom(character: Character, world: World): ActionReservation {
    // Deterministic pseudo-random direction per character per tick
    const idHash = hashString(character.id);
    const direction = ((world.tick * 137 + idHash) % 360 + 360) % 360;
    return { op: 'MOVE', slotIndex: 0, direction };
  }

  function buildAssemble(
    action: PrimitiveAction,
    character: Character,
  ): ActionReservation | null {
    const templateIndex = action.arg0;
    if (templateIndex < 0 || templateIndex >= character.assemblyTemplates.length) {
      return null;
    }
    const template = character.assemblyTemplates[templateIndex];
    return {
      op: 'ASSEMBLE',
      slotIndex: 0,
      components: template.components,
      childLocalId: -1,  // Primitive ASSEMBLE uses -1 as marker
      primitiveTemplate: template,
    };
  }

  return { evaluate };
}

// ============================================================
// Helpers
// ============================================================
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 65536;
}
