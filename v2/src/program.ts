import type {
  Action,
  Character,
  Condition,
  Direction,
  NearbyTargetType,
  Position,
  Program,
  World,
} from './types.js';
import { isActive } from './character.js';

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
// Nearby check
// ============================================================
function isNearby(
  type: NearbyTargetType,
  radius: number,
  character: Character,
  world: World,
): boolean {
  const targets = findTargets(type, character, world);
  return targets.some((pos) => manhattanDistance(character.position, pos) <= radius);
}

// ============================================================
// Find nearest target and return direction
// ============================================================
export function findNearestDirection(
  type: NearbyTargetType,
  character: Character,
  world: World,
): Direction | null {
  const targets = findTargets(type, character, world);
  if (targets.length === 0) return null;

  let nearest = targets[0];
  let minDist = manhattanDistance(character.position, nearest);
  for (const t of targets.slice(1)) {
    const d = manhattanDistance(character.position, t);
    if (d < minDist) {
      nearest = t;
      minDist = d;
    }
  }
  return directionTo(character.position, nearest);
}

export function findTargets(type: NearbyTargetType, character: Character, world: World): Position[] {
  switch (type) {
    case 'OreNode':
      return world.resourceNodes
        .filter((n) => n.type === 'OreNode' && n.remaining > 0)
        .map((n) => n.position);
    case 'CrystalNode':
      return world.resourceNodes
        .filter((n) => n.type === 'CrystalNode' && n.remaining > 0)
        .map((n) => n.position);
    case 'EnergyNode':
      return world.energyNodes
        .filter((n) => n.stored > 0)
        .map((n) => n.position);
    case 'Character':
      return world.characters
        .filter((c) => c.id !== character.id && isActive(c))
        .map((c) => c.position);
    case 'InactiveCharacter':
      return world.characters
        .filter((c) => c.id !== character.id && !isActive(c))
        .map((c) => c.position);
    case 'Remains':
      return world.remains.map((r) => r.position);
  }
}

export function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function directionTo(from: Position, to: Position): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 'E' : 'W';
  }
  return dy > 0 ? 'S' : 'N';
}

export function movePosition(pos: Position, dir: Direction): Position {
  switch (dir) {
    case 'N': return { x: pos.x, y: pos.y - 1 };
    case 'S': return { x: pos.x, y: pos.y + 1 };
    case 'E': return { x: pos.x + 1, y: pos.y };
    case 'W': return { x: pos.x - 1, y: pos.y };
  }
}
