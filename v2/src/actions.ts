import type {
  Action,
  ActionResult,
  Character,
  ComponentType,
  Direction,
  Position,
  Program,
  World,
} from './types.js';
import { hasComponent, createInactiveCharacter, setPosition } from './character.js';
import {
  addItem,
  addItems,
  findCraftRecipe,
  findProcessRecipe,
  hasItems,
  isComponentType,
  removeItems,
} from './recipes.js';
import { REPAIR_AMOUNT } from './constants.js';
import {
  RECHARGE_AMOUNT,
  ASSEMBLE_ENERGY_TRANSFER,
  getActionEnergyCost,
  getAssembleTotalCost,
  getFailurePenalty,
} from './constants.js';
import {
  depleteResourceNode,
  drainEnergyNode,
  findAdjacentEnergyNode,
  findAdjacentRemains,
  findAdjacentResourceNode,
  getCharacter,
  isInBounds,
  isOccupied,
  updateCharacter,
  addCharacter,
  nextCharacterId,
  updateRemains,
} from './world.js';
import { findNearestDirection, findTargets, chebyshevDistance, directionTo, movePosition } from './program.js';
import type { EvalContext } from './program.js';

const NEAREST_INACTIVE_TARGET = 'nearest_inactive';

// ============================================================
// Execute an Action with energy handling
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

  // NOOP: always succeeds, no cost
  if (action.op === 'NOOP') {
    return { world, characterId, action, success: true, events: [] };
  }

  // Determine energy cost
  const baseCost = action.op === 'ASSEMBLE' ? getAssembleTotalCost() : getActionEnergyCost(action.op);

  // Energy insufficient: fail without consuming energy
  if (character.energy < baseCost) {
    return { world, characterId, action, success: false, events: [] };
  }

  // Attempt the action
  const result = executeActionInner(world, character, action, evalContext);

  if (result.success) {
    // Success: consume full cost
    const updated = getCharacter(result.world, characterId);
    if (updated) {
      const newWorld = updateCharacter(result.world, { ...updated, energy: updated.energy - baseCost });
      return { ...result, world: newWorld };
    }
    return result;
  }

  // Precondition failure: consume penalty
  const penalty = getFailurePenalty(baseCost);
  const updatedChar = getCharacter(result.world, characterId);
  if (updatedChar) {
    const newWorld = updateCharacter(result.world, { ...updatedChar, energy: updatedChar.energy - penalty });
    return { ...result, world: newWorld };
  }
  return result;
}

// ============================================================
// Inner action execution (no energy handling)
// ============================================================
function executeActionInner(
  world: World,
  character: Character,
  action: Action,
  evalContext?: EvalContext,
): ActionResult {
  switch (action.op) {
    case 'MOVE':
      return executeMove(world, character, action.direction, evalContext);
    case 'HARVEST':
      return executeHarvest(world, character);
    case 'RECHARGE':
      return executeRecharge(world, character);
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
    case 'DISASSEMBLE':
      return executeDisassemble(world, character);
    default:
      return fail(world, character, action);
  }
}

// ============================================================
// MOVE — v2: check tile occupation + slide
// ============================================================

// Slide fallback: for cardinals, perpendicular pair (counter-clockwise first)
// For diagonals, the two cardinal components
const SLIDE_DIRECTIONS: Readonly<Record<Direction, [Direction, Direction]>> = {
  N:  ['W',  'E'],
  E:  ['N',  'S'],
  S:  ['E',  'W'],
  W:  ['S',  'N'],
  NE: ['N',  'E'],
  NW: ['N',  'W'],
  SE: ['S',  'E'],
  SW: ['S',  'W'],
};

function findMoveTarget(
  world: World,
  from: Position,
  dir: Direction,
): Position | null {
  const primary = movePosition(from, dir);
  if (isInBounds(world, primary) && !isOccupied(world, primary)) {
    return primary;
  }
  const [slide1, slide2] = SLIDE_DIRECTIONS[dir];
  const alt1 = movePosition(from, slide1);
  if (isInBounds(world, alt1) && !isOccupied(world, alt1)) {
    return alt1;
  }
  const alt2 = movePosition(from, slide2);
  if (isInBounds(world, alt2) && !isOccupied(world, alt2)) {
    return alt2;
  }
  return null;
}

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
    const targetType = evalContext?.lastNearbyType;
    const senseDir = targetType
      ? findNearestDirection(targetType, character, world)
      : null;
    if (!senseDir) return fail(world, character, { op: 'MOVE', direction });
    dir = senseDir;
  } else {
    dir = direction;
  }

  const target = findMoveTarget(world, character.position, dir);
  if (!target) {
    return fail(world, character, { op: 'MOVE', direction });
  }

  const updated = setPosition(character, target);
  return ok(updateCharacter(world, updated), character, { op: 'MOVE', direction });
}

// ============================================================
// HARVEST — v2: adjacent tile, finite remaining
// ============================================================
function executeHarvest(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Harvester')) {
    return fail(world, character, { op: 'HARVEST' });
  }

  const node = findAdjacentResourceNode(world, character.position);
  if (!node) return fail(world, character, { op: 'HARVEST' });

  const item = node.type === 'OreNode' ? 'Ore' : 'Crystal';
  const updated = { ...character, inventory: addItem(character.inventory, item) };
  let newWorld = depleteResourceNode(world, node.position);
  newWorld = updateCharacter(newWorld, updated);

  return ok(newWorld, character, { op: 'HARVEST' });
}

// ============================================================
// RECHARGE — v2: new action, adjacent EnergyNode
// ============================================================
function executeRecharge(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Charger')) {
    return fail(world, character, { op: 'RECHARGE' });
  }

  const node = findAdjacentEnergyNode(world, character.position);
  if (!node) return fail(world, character, { op: 'RECHARGE' });

  const amount = Math.min(RECHARGE_AMOUNT, node.stored);
  const updated = { ...character, energy: character.energy + amount };
  let newWorld = drainEnergyNode(world, node.position, amount);
  newWorld = updateCharacter(newWorld, updated);

  return ok(newWorld, character, { op: 'RECHARGE' });
}

// ============================================================
// PROCESS
// ============================================================
function executeProcess(world: World, character: Character, recipe: string): ActionResult {
  if (!hasComponent(character, 'Assembler')) {
    return fail(world, character, { op: 'PROCESS', recipe: recipe as any });
  }
  const processRecipe = findProcessRecipe(recipe);
  if (!processRecipe) return fail(world, character, { op: 'PROCESS', recipe: recipe as any });
  if (!hasItems(character.inventory, processRecipe.inputs)) {
    return fail(world, character, { op: 'PROCESS', recipe: recipe as any });
  }

  let inv = removeItems(character.inventory, processRecipe.inputs);
  inv = addItem(inv, processRecipe.output);
  const updated = { ...character, inventory: inv };

  return ok(updateCharacter(world, updated), character, { op: 'PROCESS', recipe: recipe as any });
}

// ============================================================
// CRAFT
// ============================================================
function executeCraft(world: World, character: Character, component: string): ActionResult {
  if (!hasComponent(character, 'Assembler')) {
    return fail(world, character, { op: 'CRAFT', component: component as ComponentType });
  }
  const craftRecipe = findCraftRecipe(component);
  if (!craftRecipe) return fail(world, character, { op: 'CRAFT', component: component as ComponentType });
  if (!hasItems(character.inventory, craftRecipe.inputs)) {
    return fail(world, character, { op: 'CRAFT', component: component as ComponentType });
  }

  let inv = removeItems(character.inventory, craftRecipe.inputs);
  inv = addItem(inv, craftRecipe.output);
  const updated = { ...character, inventory: inv };

  return ok(updateCharacter(world, updated), character, { op: 'CRAFT', component: component as ComponentType });
}

// ============================================================
// ASSEMBLE — v2: energy transfer, tile occupation check
// ============================================================
function executeAssemble(
  world: World,
  character: Character,
  components: readonly ComponentType[],
): ActionResult {
  if (!hasComponent(character, 'Assembler')) {
    return fail(world, character, { op: 'ASSEMBLE', components });
  }

  const required: Record<string, number> = {};
  for (const c of components) {
    required[c] = (required[c] ?? 0) + 1;
  }
  if (!hasItems(character.inventory, required)) {
    return fail(world, character, { op: 'ASSEMBLE', components });
  }

  const adjacentPos = findAdjacentFreeTile(world, character.position);
  if (!adjacentPos) return fail(world, character, { op: 'ASSEMBLE', components });

  const inv = removeItems(character.inventory, required);
  // Energy transfer: deduct from parent (done in outer executeAction via baseCost)
  // Child receives ASSEMBLE_ENERGY_TRANSFER
  const updatedParent = { ...character, inventory: inv };

  const { id: childId, world: worldWithId } = nextCharacterId(world);
  const child = createInactiveCharacter(childId, adjacentPos, components, ASSEMBLE_ENERGY_TRANSFER);

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

function findAdjacentFreeTile(world: World, pos: import('./types.js').Position): import('./types.js').Position | null {
  const directions: Direction[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
  for (const d of directions) {
    const newPos = movePosition(pos, d);
    if (isInBounds(world, newPos) && !isOccupied(world, newPos)) {
      return newPos;
    }
  }
  return null;
}

// ============================================================
// WRITE
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
  if (!target) return fail(world, character, { op: 'WRITE', target: targetId });
  if (!target.components.includes('MemoryCore')) {
    return fail(world, character, { op: 'WRITE', target: targetId });
  }

  const programCopy: Program = JSON.parse(JSON.stringify(character.program));
  const updatedTarget = { ...target, program: programCopy };

  return ok(updateCharacter(world, updatedTarget), character, { op: 'WRITE', target: targetId });
}

// ============================================================
// ACTIVATE
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

  return ok(world, character, { op: 'ACTIVATE', target: targetId });
}

// ============================================================
// SENSE — v2: includes EnergyNode, Remains
// ============================================================
function executeSense(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Sensor')) {
    return fail(world, character, { op: 'SENSE' });
  }

  const nearestByType: Record<string, { position: import('./types.js').Position; direction: Direction }> = {};
  const types: import('./types.js').NearbyTargetType[] = [
    'OreNode', 'CrystalNode', 'EnergyNode', 'Character', 'InactiveCharacter', 'Remains',
  ];

  for (const type of types) {
    const targets = findTargets(type, character, world);
    if (targets.length > 0) {
      let nearest = targets[0];
      let minDist = chebyshevDistance(character.position, nearest);
      for (const t of targets.slice(1)) {
        const d = chebyshevDistance(character.position, t);
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

  const updated: Character = { ...character, senseData: { nearestByType } };

  return ok(updateCharacter(world, updated), character, { op: 'SENSE' });
}

// ============================================================
// REPAIR
// ============================================================
function executeRepair(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Assembler')) {
    return fail(world, character, { op: 'REPAIR' });
  }

  const updated = { ...character, durability: character.durability + REPAIR_AMOUNT };

  return ok(updateCharacter(world, updated), character, { op: 'REPAIR' });
}

// ============================================================
// DISASSEMBLE — v2: new action
// ============================================================
function executeDisassemble(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Disassembler')) {
    return fail(world, character, { op: 'DISASSEMBLE' });
  }

  const remains = findAdjacentRemains(world, character.position);
  if (!remains) return fail(world, character, { op: 'DISASSEMBLE' });

  // Determine what to take: inventory items first (alphabetical), then components (alphabetical)
  const invEntries = Object.entries(remains.inventory)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  if (invEntries.length > 0) {
    const [itemName] = invEntries[0];
    // Remove 1 from remains inventory
    const newRemainsInv = { ...remains.inventory, [itemName]: (remains.inventory[itemName] ?? 0) - 1 };
    if (newRemainsInv[itemName] <= 0) delete newRemainsInv[itemName];

    // If item is a component, decompose to craft recipe inputs
    let updatedCharacter: Character;
    if (isComponentType(itemName)) {
      const recipe = findCraftRecipe(itemName);
      if (recipe) {
        updatedCharacter = { ...character, inventory: addItems(character.inventory, recipe.inputs) };
      } else {
        updatedCharacter = { ...character, inventory: addItem(character.inventory, itemName) };
      }
    } else {
      updatedCharacter = { ...character, inventory: addItem(character.inventory, itemName) };
    }

    const newRemains = { ...remains, inventory: newRemainsInv };
    const isEmpty = Object.keys(newRemainsInv).length === 0 && newRemains.components.length === 0;

    let newWorld = updateCharacter(world, updatedCharacter);
    newWorld = updateRemains(newWorld, remains, isEmpty ? null : newRemains);

    return ok(newWorld, character, { op: 'DISASSEMBLE' });
  }

  if (remains.components.length > 0) {
    const sorted = [...remains.components].sort((a, b) => a.localeCompare(b));
    const componentName = sorted[0];

    // Remove component from remains
    const idx = remains.components.indexOf(componentName);
    const newComponents = [...remains.components];
    newComponents.splice(idx, 1);

    // Decompose component to craft recipe inputs
    const recipe = findCraftRecipe(componentName);
    let updatedCharacter: Character;
    if (recipe) {
      updatedCharacter = { ...character, inventory: addItems(character.inventory, recipe.inputs) };
    } else {
      updatedCharacter = { ...character, inventory: addItem(character.inventory, componentName) };
    }

    const isEmpty = newComponents.length === 0 && Object.keys(remains.inventory).length === 0;
    const newRemains = { ...remains, components: newComponents };

    let newWorld = updateCharacter(world, updatedCharacter);
    newWorld = updateRemains(newWorld, remains, isEmpty ? null : newRemains);

    return ok(newWorld, character, { op: 'DISASSEMBLE' });
  }

  return fail(world, character, { op: 'DISASSEMBLE' });
}

// ============================================================
// Resolve target: "nearest_inactive" → actual ID
// ============================================================
function resolveTarget(targetId: string, character: Character, world: World): string | null {
  if (targetId === NEAREST_INACTIVE_TARGET) {
    const inactive = world.characters.find(
      (c) => c.id !== character.id && !c.program &&
        Math.max(Math.abs(c.position.x - character.position.x), Math.abs(c.position.y - character.position.y)) <= 1,
    );
    return inactive?.id ?? null;
  }
  return targetId;
}

// ============================================================
// Helpers
// ============================================================
function ok(world: World, character: Character, action: Action): ActionResult {
  return { world, characterId: character.id, action, success: true, events: [] };
}

function fail(world: World, character: Character, action: Action): ActionResult {
  return { world, characterId: character.id, action, success: false, events: [] };
}
