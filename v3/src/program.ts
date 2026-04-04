import type {
  Action,
  Character,
  Condition,
  NearbyTargetType,
  Position,
  Program,
  World,
} from './types.js';
import { isActive } from './character.js';
import { distance } from './world.js';
import { SENSE_RANGE } from './constants.js';

// Evaluation context — tracks the last nearby match for toward_nearest
export interface EvalContext {
  lastNearbyType: NearbyTargetType | null;
}

// ============================================================
// Evaluate a Program — returns the Action and context
// ============================================================
export function evaluateProgram(
  program: Program,
  character: Character,
  world: World,
): { action: Action; context: EvalContext } {
  for (const rule of program.rules) {
    const ctx: EvalContext = { lastNearbyType: null };
    if (evaluateConditionWithCtx(rule.condition, character, world, ctx)) {
      return { action: rule.action, context: ctx };
    }
  }
  return { action: { op: 'NOOP' }, context: { lastNearbyType: null } };
}

// ============================================================
// Evaluate a Condition
// ============================================================
export function evaluateCondition(
  condition: Condition,
  character: Character,
  world: World,
): boolean {
  return evaluateConditionWithCtx(condition, character, world, { lastNearbyType: null });
}

function evaluateConditionWithCtx(
  condition: Condition,
  character: Character,
  world: World,
  ctx: EvalContext,
): boolean {
  switch (condition.op) {
    case 'true':
      return true;
    case 'inventory_has':
      return (character.inventory[condition.item] ?? 0) >= condition.count;
    case 'durability_below':
      return character.durability < condition.threshold;
    case 'energy_below':
      return character.energy < condition.threshold;
    case 'nearby': {
      const result = isNearby(condition.type, condition.radius, character, world);
      if (result) ctx.lastNearbyType = condition.type;
      return result;
    }
    case 'and':
      return condition.conditions.every((c) => evaluateConditionWithCtx(c, character, world, ctx));
    case 'or':
      return condition.conditions.some((c) => evaluateConditionWithCtx(c, character, world, ctx));
    case 'not':
      return !evaluateConditionWithCtx(condition.condition, character, world, ctx);
  }
}

// ============================================================
// Nearby check (v3: Euclidean distance)
// ============================================================
function isNearby(
  type: NearbyTargetType,
  radius: number,
  character: Character,
  world: World,
): boolean {
  const targets = findTargets(type, character, world);
  return targets.some((pos) => distance(character.position, pos) <= radius);
}

// ============================================================
// Find nearest target and return angle in degrees (v3)
// ============================================================
export function findNearestAngle(
  type: NearbyTargetType,
  character: Character,
  world: World,
): number | null {
  const targets = findTargets(type, character, world);
  if (targets.length === 0) return null;

  let nearest = targets[0];
  let minDist = distance(character.position, nearest);
  for (const t of targets.slice(1)) {
    const d = distance(character.position, t);
    if (d < minDist) {
      nearest = t;
      minDist = d;
    }
  }

  return angleTo(character.position, nearest);
}

export function findTargets(type: NearbyTargetType, character: Character, world: World): Position[] {
  const withinRange = (pos: Position) => distance(character.position, pos) <= SENSE_RANGE;
  switch (type) {
    case 'OreNode':
      return world.resourceNodes
        .filter((n) => n.type === 'OreNode' && n.remaining > 0 && withinRange(n.position))
        .map((n) => n.position);
    case 'CrystalNode':
      return world.resourceNodes
        .filter((n) => n.type === 'CrystalNode' && n.remaining > 0 && withinRange(n.position))
        .map((n) => n.position);
    case 'EnergyNode':
      return world.energyNodes
        .filter((n) => n.stored > 0 && withinRange(n.position))
        .map((n) => n.position);
    case 'Character':
      return world.characters
        .filter((c) => c.id !== character.id && isActive(c) && withinRange(c.position))
        .map((c) => c.position);
    case 'InactiveCharacter':
      return world.characters
        .filter((c) => c.id !== character.id && !isActive(c) && withinRange(c.position))
        .map((c) => c.position);
    case 'Remains':
      return world.remains
        .filter((r) => withinRange(r.position))
        .map((r) => r.position);
  }
}

// ============================================================
// Angle from A to B in degrees (0=right, 90=down)
// ============================================================
export function angleTo(from: Position, to: Position): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const rad = Math.atan2(dy, dx);
  const deg = (rad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
