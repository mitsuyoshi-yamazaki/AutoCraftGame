import type {
  Action,
  ActionResult,
  Character,
  ComponentType,
  MoveDirection,
  NearbyTargetType,
  Position,
  Program,
  World,
} from './types.js';
import { hasComponent, createInactiveCharacter, readRegister } from './character.js';
import {
  addItem,
  addItems,
  findCraftRecipe,
  findProcessRecipe,
  hasItems,
  isComponentType,
  removeItems,
  calculateMass,
} from './recipes.js';
import {
  REPAIR_AMOUNT,
  RECHARGE_AMOUNT,
  ASSEMBLE_ENERGY_TRANSFER,
  MOVE_FORCE,
  SPAWN_DISTANCE,
  INTERACT_RANGE,
  SENSE_RANGE,
  getActionEnergyCost,
  getAssembleTotalCost,
  getFailurePenalty,
} from './constants.js';
import {
  depleteResourceNode,
  drainEnergyNode,
  findNearestResourceNode,
  findNearestEnergyNode,
  findNearestRemains,
  findNearestInactiveCharacter,
  findSpawnPosition,
  getCharacter,
  updateCharacter,
  addCharacter,
  nextCharacterId,
  updateRemains,
  distance,
} from './world.js';
import { findTargets } from './program.js';
import type { ForceMap } from './physics.js';

// ============================================================
// Execute an Action with energy handling
// ============================================================
export function executeAction(
  world: World,
  characterId: string,
  action: Action,
  forces: ForceMap,
): ActionResult {
  const character = getCharacter(world, characterId);
  if (!character) {
    return { world, characterId, action, success: false, events: [] };
  }

  if (action.op === 'NOOP') {
    return { world, characterId, action, success: true, events: [] };
  }

  const baseCost = action.op === 'ASSEMBLE' ? getAssembleTotalCost() : getActionEnergyCost(action.op);

  if (character.energy < baseCost) {
    return { world, characterId, action, success: false, events: [] };
  }

  const result = executeActionInner(world, character, action, forces);

  if (result.success) {
    const updated = getCharacter(result.world, characterId);
    if (updated) {
      const newWorld = updateCharacter(result.world, { ...updated, energy: Math.max(0, updated.energy - baseCost) });
      return { ...result, world: newWorld };
    }
    return result;
  }

  const penalty = getFailurePenalty(baseCost);
  const updatedChar = getCharacter(result.world, characterId);
  if (updatedChar) {
    const newWorld = updateCharacter(result.world, { ...updatedChar, energy: Math.max(0, updatedChar.energy - penalty) });
    return { ...result, world: newWorld };
  }
  return result;
}

// ============================================================
// Inner action execution
// ============================================================
function executeActionInner(
  world: World,
  character: Character,
  action: Action,
  forces: ForceMap,
): ActionResult {
  switch (action.op) {
    case 'MOVE':
      return executeMove(world, character, action, forces);
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
// Resolve MOVE direction — number literal or register reference
// ============================================================
function resolveMoveDirection(direction: MoveDirection, character: Character): number | null {
  if (typeof direction === 'number') return direction;
  return readRegister(character, direction.register);
}

// ============================================================
// MOVE — v3: apply force in direction
// ============================================================
function executeMove(
  world: World,
  character: Character,
  action: { readonly op: 'MOVE'; readonly direction: MoveDirection },
  forces: ForceMap,
): ActionResult {
  if (!hasComponent(character, 'Actuator')) {
    return fail(world, character, action);
  }

  const angleDeg = resolveMoveDirection(action.direction, character);
  if (angleDeg === null) {
    return fail(world, character, action);
  }

  const rad = (angleDeg * Math.PI) / 180;
  const fx = MOVE_FORCE * Math.cos(rad);
  const fy = MOVE_FORCE * Math.sin(rad);

  const existing = forces.get(character.id);
  if (existing) {
    forces.set(character.id, { fx: existing.fx + fx, fy: existing.fy + fy });
  } else {
    forces.set(character.id, { fx, fy });
  }

  return ok(world, character, action);
}

// ============================================================
// HARVEST — v3: distance-based
// ============================================================
function executeHarvest(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Harvester')) {
    return fail(world, character, { op: 'HARVEST' });
  }

  const node = findNearestResourceNode(world, character.position);
  if (!node) return fail(world, character, { op: 'HARVEST' });

  const item = node.type === 'OreNode' ? 'Ore' : 'Crystal';
  const updated = { ...character, inventory: addItem(character.inventory, item) };
  let newWorld = depleteResourceNode(world, node.id);
  newWorld = updateCharacter(newWorld, updated);

  return ok(newWorld, character, { op: 'HARVEST' });
}

// ============================================================
// RECHARGE — v3: distance-based
// ============================================================
function executeRecharge(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Charger')) {
    return fail(world, character, { op: 'RECHARGE' });
  }

  const node = findNearestEnergyNode(world, character.position);
  if (!node) return fail(world, character, { op: 'RECHARGE' });

  const amount = Math.min(RECHARGE_AMOUNT, node.stored);
  const updated = { ...character, energy: character.energy + amount };
  let newWorld = drainEnergyNode(world, node.id, amount);
  newWorld = updateCharacter(newWorld, updated);

  return ok(newWorld, character, { op: 'RECHARGE' });
}

// ============================================================
// PROCESS (same as v2)
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
// CRAFT (same as v2)
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
// ASSEMBLE — v3: spawn at SPAWN_DISTANCE
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
  for (const c of components) required[c] = (required[c] ?? 0) + 1;
  if (!hasItems(character.inventory, required)) {
    return fail(world, character, { op: 'ASSEMBLE', components });
  }

  const spawnPos = findSpawnPosition(world, character.position, character.velocity, SPAWN_DISTANCE);
  if (!spawnPos) return fail(world, character, { op: 'ASSEMBLE', components });

  const inv = removeItems(character.inventory, required);
  const updatedParent = { ...character, inventory: inv };

  const { id: childId, world: worldWithId } = nextCharacterId(world);
  const child = createInactiveCharacter(childId, spawnPos, components, ASSEMBLE_ENERGY_TRANSFER);

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

// ============================================================
// WRITE — v3: distance-based
// ============================================================
function executeWrite(world: World, character: Character, targetId: string): ActionResult {
  if (!hasComponent(character, 'Processor')) {
    return fail(world, character, { op: 'WRITE', target: targetId });
  }
  if (!character.program) {
    return fail(world, character, { op: 'WRITE', target: targetId });
  }

  const resolved = resolveTarget(targetId, character, world);
  const target = resolved ? getCharacter(world, resolved) : null;
  if (!target) return fail(world, character, { op: 'WRITE', target: targetId });
  if (!target.components.includes('MemoryCore')) {
    return fail(world, character, { op: 'WRITE', target: targetId });
  }

  const programCopy: Program = JSON.parse(JSON.stringify(character.program));
  const updatedTarget = { ...target, program: programCopy };

  return ok(updateCharacter(world, updatedTarget), character, { op: 'WRITE', target: targetId });
}

// ============================================================
// ACTIVATE — v3: distance-based
// ============================================================
function executeActivate(world: World, character: Character, targetId: string): ActionResult {
  if (!hasComponent(character, 'Processor')) {
    return fail(world, character, { op: 'ACTIVATE', target: targetId });
  }

  const resolved = resolveTarget(targetId, character, world);
  const target = resolved ? getCharacter(world, resolved) : null;
  if (!target || !target.program) {
    return fail(world, character, { op: 'ACTIVATE', target: targetId });
  }

  return ok(world, character, { op: 'ACTIVATE', target: targetId });
}

// ============================================================
// SENSE — v3: returns relative position
// ============================================================
function executeSense(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Sensor')) {
    return fail(world, character, { op: 'SENSE' });
  }

  const nearestByType: Record<string, { relativePosition: Position }> = {};
  const types: NearbyTargetType[] = [
    'OreNode', 'CrystalNode', 'EnergyNode', 'Character', 'InactiveCharacter', 'Remains',
  ];

  for (const type of types) {
    const targets = findTargets(type, character, world);
    // Filter by SENSE_RANGE
    let nearest: Position | null = null;
    let minDist = Infinity;
    for (const t of targets) {
      const d = distance(character.position, t);
      if (d <= SENSE_RANGE && d < minDist) {
        nearest = t;
        minDist = d;
      }
    }
    if (nearest) {
      nearestByType[type] = {
        relativePosition: {
          x: nearest.x - character.position.x,
          y: nearest.y - character.position.y,
        },
      };
    }
  }

  const updated: Character = { ...character, senseData: { nearestByType } };
  return ok(updateCharacter(world, updated), character, { op: 'SENSE' });
}

// ============================================================
// REPAIR (same as v2)
// ============================================================
function executeRepair(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Assembler')) {
    return fail(world, character, { op: 'REPAIR' });
  }

  const updated = { ...character, durability: character.durability + REPAIR_AMOUNT };
  return ok(updateCharacter(world, updated), character, { op: 'REPAIR' });
}

// ============================================================
// DISASSEMBLE — v3: distance-based
// ============================================================
function executeDisassemble(world: World, character: Character): ActionResult {
  if (!hasComponent(character, 'Disassembler')) {
    return fail(world, character, { op: 'DISASSEMBLE' });
  }

  const remains = findNearestRemains(world, character.position);
  if (!remains) return fail(world, character, { op: 'DISASSEMBLE' });

  const invEntries = Object.entries(remains.inventory)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  if (invEntries.length > 0) {
    const [itemName] = invEntries[0];
    const newRemainsInv = { ...remains.inventory, [itemName]: (remains.inventory[itemName] ?? 0) - 1 };
    if (newRemainsInv[itemName] <= 0) delete newRemainsInv[itemName];

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
    const idx = remains.components.indexOf(componentName);
    const newComponents = [...remains.components];
    newComponents.splice(idx, 1);

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
  if (targetId === 'nearest_inactive') {
    const target = findNearestInactiveCharacter(world, character.position, character.id);
    return target?.id ?? null;
  }
  // Direct ID reference: check distance
  const target = getCharacter(world, targetId);
  if (target && distance(character.position, target.position) <= INTERACT_RANGE) {
    return targetId;
  }
  return null;
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
