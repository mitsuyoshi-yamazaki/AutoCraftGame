import type {
  Action,
  Character,
  Condition,
  Direction,
  NearbyTargetType,
  Position,
  Program,
  SenseData,
  World,
} from './types.js';
import { hasComponent, isActive, setInventory, setPosition } from './character.js';
import {
  addItem,
  findCraftRecipe,
  findProcessRecipe,
  hasItems,
  removeItems,
  FRAME_DURABILITY,
} from './recipes.js';
import {
  depleteNode,
  getCharacter,
  isInBounds,
  resourceNodeAt,
  updateCharacter,
  addCharacter,
  nextCharacterId,
} from './world.js';
import { createInactiveCharacter } from './character.js';
import { findAdjacentInactive } from './replication.js';
import type { ActionResult, ComponentType } from './types.js';

const NEAREST_INACTIVE_TARGET = 'nearest_inactive';

// Evaluation context — tracks the last nearby match for toward_nearest
interface EvalContext {
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
// Evaluate a Condition (public — without context tracking)
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
// Check nearby — also updates sense data direction
// ============================================================
function isNearby(
  type: NearbyTargetType,
  radius: number,
  character: Character,
  world: World,
): boolean {
  const targets = findTargets(type, character, world);
  const withinRadius = targets.filter(
    (pos) => manhattanDistance(character.position, pos) <= radius,
  );
  return withinRadius.length > 0;
}

// ============================================================
// Find nearest target of a type and return direction
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

function findTargets(type: NearbyTargetType, character: Character, world: World): Position[] {
  switch (type) {
    case 'OreNode':
      return world.resourceNodes
        .filter((n) => n.type === 'OreNode' && !n.depleted)
        .map((n) => n.position);
    case 'CrystalNode':
      return world.resourceNodes
        .filter((n) => n.type === 'CrystalNode' && !n.depleted)
        .map((n) => n.position);
    case 'Character':
      return world.characters
        .filter((c) => c.id !== character.id && isActive(c))
        .map((c) => c.position);
    case 'InactiveCharacter':
      return world.characters
        .filter((c) => c.id !== character.id && !isActive(c))
        .map((c) => c.position);
  }
}

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function directionTo(from: Position, to: Position): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Prefer axis with greater distance
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 'E' : 'W';
  }
  return dy > 0 ? 'S' : 'N';
}

// ============================================================
// Execute an Action
// ============================================================
export function executeAction(
  world: World,
  characterId: string,
  action: Action,
  evalContext?: EvalContext,
): ActionResult {
  const character = getCharacter(world, characterId);
  if (!character) {
    return { world, characterId, action, success: false, events: [] };
  }

  switch (action.op) {
    case 'NOOP':
      return { world, characterId, action, success: true, events: [] };

    case 'MOVE':
      return executeMove(world, character, action.direction, evalContext);

    case 'HARVEST':
      return executeHarvest(world, character);

    case 'PROCESS':
      return executeProcess(world, character, action.recipe);

    case 'CRAFT':
      return executeCraft(world, character, action.component);

    case 'ASSEMBLE':
      return executeAssemble(world, character, action.components);

    case 'WRITE':
      return executeWrite(world, character, action.target);

    case 'ACTIVATE':
      return executeActivate(world, character, action.target);

    case 'SENSE':
      return executeSense(world, character);

    case 'REPAIR':
      return executeRepair(world, character);
  }
}

// ============================================================
// MOVE
// ============================================================
function executeMove(
  world: World,
  character: Character,
  direction: Direction | 'toward_nearest',
  evalContext?: EvalContext,
): ActionResult {
  if (!hasComponent(character, 'Actuator')) {
    return fail(world, character, { op: 'MOVE', direction });
  }

  let dir: Direction;
  if (direction === 'toward_nearest') {
    // Use the nearby type from the condition that matched
    const targetType = evalContext?.lastNearbyType;
    const senseDir = targetType
      ? findNearestDirection(targetType, character, world)
      : findNearestDirectionFromSense(character, world);
    if (!senseDir) {
      return fail(world, character, { op: 'MOVE', direction });
    }
    dir = senseDir;
  } else {
    dir = direction;
  }

  const newPos = movePosition(character.position, dir);
  if (!isInBounds(world, newPos)) {
    return fail(world, character, { op: 'MOVE', direction });
  }

  const updated = setPosition(character, newPos);
  return {
    world: updateCharacter(world, updated),
    characterId: character.id,
    action: { op: 'MOVE', direction },
    success: true,
    events: [],
  };
}

function findNearestDirectionFromSense(character: Character, world: World): Direction | null {
  // Try all target types and find the nearest overall
  const types: NearbyTargetType[] = ['OreNode', 'CrystalNode', 'Character', 'InactiveCharacter'];
  let bestDir: Direction | null = null;
  let bestDist = Infinity;

  for (const type of types) {
    const targets = findTargets(type, character, world);
    for (const t of targets) {
      const d = manhattanDistance(character.position, t);
      if (d < bestDist) {
        bestDist = d;
        bestDir = directionTo(character.position, t);
      }
    }
  }
  return bestDir;
}

function movePosition(pos: Position, dir: Direction): Position {
  switch (dir) {
    case 'N': return { x: pos.x, y: pos.y - 1 };
    case 'S': return { x: pos.x, y: pos.y + 1 };
    case 'E': return { x: pos.x + 1, y: pos.y };
    case 'W': return { x: pos.x - 1, y: pos.y };
  }
}

// ============================================================
// HARVEST
// ============================================================
function executeHarvest(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Harvester')) {
    return fail(world, character, { op: 'HARVEST' });
  }

  const node = resourceNodeAt(world, character.position);
  if (!node) {
    return fail(world, character, { op: 'HARVEST' });
  }

  const item = node.type === 'OreNode' ? 'Ore' : 'Crystal';
  const updated = { ...character, inventory: addItem(character.inventory, item) };
  let newWorld = depleteNode(world, character.position);
  newWorld = updateCharacter(newWorld, updated);

  return { world: newWorld, characterId: character.id, action: { op: 'HARVEST' }, success: true, events: [] };
}

// ============================================================
// PROCESS
// ============================================================
function executeProcess(world: World, character: Character, recipe: string): ActionResult {
  if (!hasComponent(character, 'Assembler')) {
    return fail(world, character, { op: 'PROCESS', recipe: recipe as any });
  }

  const processRecipe = findProcessRecipe(recipe);
  if (!processRecipe) {
    return fail(world, character, { op: 'PROCESS', recipe: recipe as any });
  }

  if (!hasItems(character.inventory, processRecipe.inputs)) {
    return fail(world, character, { op: 'PROCESS', recipe: recipe as any });
  }

  let inv = removeItems(character.inventory, processRecipe.inputs);
  inv = addItem(inv, processRecipe.output);
  const updated = { ...character, inventory: inv };

  return {
    world: updateCharacter(world, updated),
    characterId: character.id,
    action: { op: 'PROCESS', recipe: recipe as any },
    success: true,
    events: [],
  };
}

// ============================================================
// CRAFT
// ============================================================
function executeCraft(world: World, character: Character, component: string): ActionResult {
  if (!hasComponent(character, 'Assembler')) {
    return fail(world, character, { op: 'CRAFT', component: component as ComponentType });
  }

  const craftRecipe = findCraftRecipe(component);
  if (!craftRecipe) {
    return fail(world, character, { op: 'CRAFT', component: component as ComponentType });
  }

  if (!hasItems(character.inventory, craftRecipe.inputs)) {
    return fail(world, character, { op: 'CRAFT', component: component as ComponentType });
  }

  let inv = removeItems(character.inventory, craftRecipe.inputs);
  inv = addItem(inv, craftRecipe.output);
  const updated = { ...character, inventory: inv };

  return {
    world: updateCharacter(world, updated),
    characterId: character.id,
    action: { op: 'CRAFT', component: component as ComponentType },
    success: true,
    events: [],
  };
}

// ============================================================
// ASSEMBLE — build inactive character from components in inventory
// ============================================================
function executeAssemble(
  world: World,
  character: Character,
  components: readonly ComponentType[],
): ActionResult {
  if (!hasComponent(character, 'Assembler')) {
    return fail(world, character, { op: 'ASSEMBLE', components });
  }

  // Check all components are in inventory
  const required: Record<string, number> = {};
  for (const c of components) {
    required[c] = (required[c] ?? 0) + 1;
  }
  if (!hasItems(character.inventory, required)) {
    return fail(world, character, { op: 'ASSEMBLE', components });
  }

  // Find an adjacent tile to place the new character
  const adjacentPos = findAdjacentTile(world, character.position);
  if (!adjacentPos) {
    return fail(world, character, { op: 'ASSEMBLE', components });
  }

  // Remove components from inventory
  const inv = removeItems(character.inventory, required);
  const updatedParent = { ...character, inventory: inv };

  // Create inactive character
  const { id: childId, world: worldWithId } = nextCharacterId(world);
  const child = createInactiveCharacter(childId, adjacentPos, components);

  let newWorld = updateCharacter(worldWithId, updatedParent);
  newWorld = addCharacter(newWorld, child);

  return {
    world: newWorld,
    characterId: character.id,
    action: { op: 'ASSEMBLE', components },
    success: true,
    events: [{ type: 'character_spawned', parentId: character.id, childId }],
  };
}

function findAdjacentTile(world: World, pos: Position): Position | null {
  const directions: Direction[] = ['N', 'S', 'E', 'W'];
  for (const d of directions) {
    const newPos = movePosition(pos, d);
    if (isInBounds(world, newPos)) {
      return newPos;
    }
  }
  return null;
}

// ============================================================
// WRITE — copy program to target inactive character's MemoryCore
// ============================================================
function executeWrite(world: World, character: Character, targetId: string): ActionResult {
  if (!hasComponent(character, 'Processor')) {
    return fail(world, character, { op: 'WRITE', target: targetId });
  }

  if (!character.program) {
    return fail(world, character, { op: 'WRITE', target: targetId });
  }

  const resolvedId = resolveTarget(targetId, character, world);
  const target = resolvedId ? getCharacter(world, resolvedId) : null;
  if (!target) {
    return fail(world, character, { op: 'WRITE', target: targetId });
  }

  if (!target.components.includes('MemoryCore')) {
    return fail(world, character, { op: 'WRITE', target: targetId });
  }

  // Deep copy program data
  const programCopy: Program = JSON.parse(JSON.stringify(character.program));
  const updatedTarget = { ...target, program: programCopy };

  return {
    world: updateCharacter(world, updatedTarget),
    characterId: character.id,
    action: { op: 'WRITE', target: targetId },
    success: true,
    events: [],
  };
}

// ============================================================
// ACTIVATE — start an inactive character
// ============================================================
function executeActivate(world: World, character: Character, targetId: string): ActionResult {
  if (!hasComponent(character, 'Processor')) {
    return fail(world, character, { op: 'ACTIVATE', target: targetId });
  }

  const resolvedId = resolveTarget(targetId, character, world);
  const target = resolvedId ? getCharacter(world, resolvedId) : null;
  if (!target || !target.program) {
    return fail(world, character, { op: 'ACTIVATE', target: targetId });
  }

  // Target is already active if it has a program — ACTIVATE is a conceptual step
  // In our model, WRITE already gives it a program; ACTIVATE just marks it as "started"
  // Since program != null means active, WRITE + ACTIVATE is redundant but follows spec
  return {
    world,
    characterId: character.id,
    action: { op: 'ACTIVATE', target: targetId },
    success: true,
    events: [],
  };
}

// ============================================================
// SENSE
// ============================================================
function executeSense(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Sensor')) {
    return fail(world, character, { op: 'SENSE' });
  }

  const nearestByType: Record<string, { position: Position; direction: Direction }> = {};
  const types: NearbyTargetType[] = ['OreNode', 'CrystalNode', 'Character', 'InactiveCharacter'];

  for (const type of types) {
    const targets = findTargets(type, character, world);
    if (targets.length > 0) {
      let nearest = targets[0];
      let minDist = manhattanDistance(character.position, nearest);
      for (const t of targets.slice(1)) {
        const d = manhattanDistance(character.position, t);
        if (d < minDist) {
          nearest = t;
          minDist = d;
        }
      }
      nearestByType[type] = {
        position: nearest,
        direction: directionTo(character.position, nearest),
      };
    }
  }

  const updated: Character = {
    ...character,
    senseData: { nearestByType },
  };

  return {
    world: updateCharacter(world, updated),
    characterId: character.id,
    action: { op: 'SENSE' },
    success: true,
    events: [],
  };
}

// ============================================================
// REPAIR
// ============================================================
function executeRepair(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Assembler')) {
    return fail(world, character, { op: 'REPAIR' });
  }

  if (!hasItems(character.inventory, { Frame: 1 })) {
    return fail(world, character, { op: 'REPAIR' });
  }

  const inv = removeItems(character.inventory, { Frame: 1 });
  const updated = { ...character, inventory: inv, durability: character.durability + FRAME_DURABILITY };

  return {
    world: updateCharacter(world, updated),
    characterId: character.id,
    action: { op: 'REPAIR' },
    success: true,
    events: [],
  };
}

// ============================================================
// Resolve target id — "nearest_inactive" → actual character id
// ============================================================
function resolveTarget(targetId: string, character: Character, world: World): string | null {
  if (targetId === NEAREST_INACTIVE_TARGET) {
    const inactive = findAdjacentInactive(world, character);
    return inactive?.id ?? null;
  }
  return targetId;
}

// ============================================================
// Helper: fail result
// ============================================================
function fail(world: World, character: Character, action: Action): ActionResult {
  return { world, characterId: character.id, action, success: false, events: [] };
}

// ============================================================
// Resolve toward_nearest — find direction from most recent
// nearby condition match in the program evaluation
// ============================================================
export function resolveTowardNearest(character: Character, world: World): Direction | null {
  // Check all target types — find the closest one across all types
  // This is used when the program specifies toward_nearest
  return findNearestDirectionFromSense(character, world);
}
