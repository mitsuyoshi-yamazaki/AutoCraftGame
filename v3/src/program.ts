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
import type { GameParams } from './params.js';
import type { SpatialGrid } from './spatial-grid.js';
import { queryRange } from './spatial-grid.js';

// ============================================================
// Angle from A to B in degrees (0=right, 90=down) — param-independent
// ============================================================
export function angleTo(from: Position, to: Position): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const rad = Math.atan2(dy, dx);
  const deg = (rad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

// ============================================================
// ProgramEngine — param-dependent functions (maker pattern)
// ============================================================
export interface ProgramEngine {
  evaluateProgram(program: Program, character: Character, world: World, grid?: SpatialGrid): { action: Action; character: Character };
  findTargets(type: NearbyTargetType, character: Character, world: World, grid?: SpatialGrid): Position[];
  findNearestAngle(type: NearbyTargetType, character: Character, world: World, grid?: SpatialGrid): number | null;
}

export function createProgramEngine(params: GameParams): ProgramEngine {

  function evaluateCondition(
    condition: Condition,
    character: Character,
    world: World,
    grid?: SpatialGrid,
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
        return isNearby(condition.type, condition.radius, character, world, grid);
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
        return condition.conditions.every((c) => evaluateCondition(c, character, world, grid));
      case 'or':
        return condition.conditions.some((c) => evaluateCondition(c, character, world, grid));
      case 'not':
        return !evaluateCondition(condition.condition, character, world, grid);
    }
  }

  function isNearby(
    type: NearbyTargetType,
    radius: number,
    character: Character,
    world: World,
    grid?: SpatialGrid,
  ): boolean {
    const targets = findTargets(type, character, world, grid);
    return targets.some((pos) => distance(character.position, pos) <= radius);
  }

  function findNearestAngle(
    type: NearbyTargetType,
    character: Character,
    world: World,
    grid?: SpatialGrid,
  ): number | null {
    if (!hasComponent(character, 'Sensor')) return null;

    const targets = findTargets(type, character, world, grid);
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

  function applySetRegisters(
    setRegisters: readonly SetRegister[] | undefined,
    character: Character,
    world: World,
    grid?: SpatialGrid,
  ): Character {
    if (!setRegisters || setRegisters.length === 0) return character;

    let updated = character;
    for (const sr of setRegisters) {
      const value = resolveRegisterValue(sr.value, updated, world, grid);
      updated = writeRegister(updated, sr.index, value);
    }
    return updated;
  }

  function resolveRegisterValue(
    value: number | null | FnValue,
    character: Character,
    world: World,
    grid?: SpatialGrid,
  ): number | null {
    if (value === null || typeof value === 'number') return value;

    switch (value.fn) {
      case 'angle_to_nearest':
        return findNearestAngle(value.type, character, world, grid);
      case 'angle_away_from_nearest': {
        const angle = findNearestAngle(value.type, character, world, grid);
        return angle !== null ? (angle + 180) % 360 : null;
      }
      case 'wander_angle':
        return character.energy % 360;
    }
  }

  function findTargets(
    type: NearbyTargetType, character: Character, world: World, grid?: SpatialGrid,
  ): Position[] {
    if (grid) {
      return findTargetsWithGrid(type, character, world, grid);
    }
    return findTargetsLinear(type, character, world);
  }

  function findTargetsWithGrid(
    type: NearbyTargetType, character: Character, world: World, grid: SpatialGrid,
  ): Position[] {
    const nearby = queryRange(grid, character.position, params.senseRange);
    const result: Position[] = [];
    const kindFilter = targetKind(type);

    for (const entry of nearby) {
      if (entry.kind !== kindFilter) continue;
      if (entry.id === character.id) continue;
      if (distance(character.position, entry.position) > params.senseRange) continue;

      if (matchesTargetType(type, entry, world)) {
        result.push(entry.position);
      }
    }
    return result;
  }

  function findTargetsLinear(type: NearbyTargetType, character: Character, world: World): Position[] {
    const withinRange = (pos: Position) => distance(character.position, pos) <= params.senseRange;
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

  function evaluateProgram(
    program: Program,
    character: Character,
    world: World,
    grid?: SpatialGrid,
  ): { action: Action; character: Character } {
    for (const rule of program.rules) {
      if (evaluateCondition(rule.condition, character, world, grid)) {
        const updatedChar = applySetRegisters(rule.set_registers, character, world, grid);
        return { action: rule.action, character: updatedChar };
      }
    }
    return { action: { op: 'NOOP' }, character };
  }

  return { evaluateProgram, findTargets, findNearestAngle };
}

// ============================================================
// Helper functions (used internally, also needed by actions)
// ============================================================
function targetKind(type: NearbyTargetType): string {
  switch (type) {
    case 'OreNode': case 'CrystalNode': return 'resourceNode';
    case 'EnergyNode': return 'energyNode';
    case 'Character': case 'InactiveCharacter': return 'character';
    case 'Remains': return 'remains';
  }
}

function matchesTargetType(
  type: NearbyTargetType,
  entry: { id: string; position: Position; kind: string },
  world: World,
): boolean {
  switch (type) {
    case 'OreNode': {
      const n = world.resourceNodes.find((r) => r.id === entry.id);
      return n !== undefined && n.type === 'OreNode' && n.remaining > 0;
    }
    case 'CrystalNode': {
      const n = world.resourceNodes.find((r) => r.id === entry.id);
      return n !== undefined && n.type === 'CrystalNode' && n.remaining > 0;
    }
    case 'EnergyNode': {
      const n = world.energyNodes.find((r) => r.id === entry.id);
      return n !== undefined && n.stored > 0;
    }
    case 'Character': {
      const c = world.characters.find((ch) => ch.id === entry.id);
      return c !== undefined && isActive(c);
    }
    case 'InactiveCharacter': {
      const c = world.characters.find((ch) => ch.id === entry.id);
      return c !== undefined && !isActive(c);
    }
    case 'Remains':
      return true;
  }
}
