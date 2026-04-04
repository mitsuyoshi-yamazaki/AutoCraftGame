import type {
  Action,
  Character,
  Condition,
  FnValue,
  NearbyTargetType,
  Position,
  Program,
  SetRegister,
  World,
} from './types.js';
import { isActive, hasComponent, readRegister, writeRegister } from './character.js';
import { distance } from './world.js';
import { SENSE_RANGE } from './constants.js';

// ============================================================
// Evaluate a Program — returns the Action and updated character
// ============================================================
export function evaluateProgram(
  program: Program,
  character: Character,
  world: World,
): { action: Action; character: Character } {
  for (const rule of program.rules) {
    if (evaluateCondition(rule.condition, character, world)) {
      const updatedChar = applySetRegisters(rule.set_registers, character, world);
      return { action: rule.action, character: updatedChar };
    }
  }
  return { action: { op: 'NOOP' }, character };
}

// ============================================================
// Evaluate a Condition
// ============================================================
export function evaluateCondition(
  condition: Condition,
  character: Character,
  world: World,
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
    case 'nearby':
      return isNearby(condition.type, condition.radius, character, world);
    case 'register_equals': {
      const val = readRegister(character, condition.index);
      return val === condition.value;
    }
    case 'register_less_than': {
      const val = readRegister(character, condition.index);
      return val !== null && val < condition.value;
    }
    case 'register_greater_than': {
      const val = readRegister(character, condition.index);
      return val !== null && val > condition.value;
    }
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, character, world));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, character, world));
    case 'not':
      return !evaluateCondition(condition.condition, character, world);
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
// Find nearest target and return angle in degrees
// ============================================================
export function findNearestAngle(
  type: NearbyTargetType,
  character: Character,
  world: World,
): number | null {
  if (!hasComponent(character, 'Sensor')) return null;

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

// ============================================================
// set_registers processing
// ============================================================
function applySetRegisters(
  setRegisters: readonly SetRegister[] | undefined,
  character: Character,
  world: World,
): Character {
  if (!setRegisters || setRegisters.length === 0) return character;

  let updated = character;
  for (const sr of setRegisters) {
    const value = resolveRegisterValue(sr.value, updated, world);
    updated = writeRegister(updated, sr.index, value);
  }
  return updated;
}

function resolveRegisterValue(
  value: number | null | FnValue,
  character: Character,
  world: World,
): number | null {
  if (value === null || typeof value === 'number') return value;

  switch (value.fn) {
    case 'angle_to_nearest':
      return findNearestAngle(value.type, character, world);
    case 'angle_away_from_nearest': {
      const angle = findNearestAngle(value.type, character, world);
      return angle !== null ? (angle + 180) % 360 : null;
    }
    case 'wander_angle':
      return character.energy % 360;
  }
}

// ============================================================
// Find targets within SENSE_RANGE
// ============================================================
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
