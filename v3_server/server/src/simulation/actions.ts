import type {
  Action,
  ActionResult,
  Character,
  ComponentType,
  MoveDirection,
  NearbyTargetType,
  Position,
  Program,
  Remains,
  World,
} from './types.js';
import { hasComponent, readRegister } from './character.js';
import type { CharacterEngine } from './character.js';
import {
  hasItems,
  isComponentType,
  removeItems,
  addItem,
  addItems,
} from './recipes.js';
import type { RecipeEngine } from './recipes.js';
import type { GameParams } from './params.js';
import { getActionEnergyCost, getFailurePenalty } from './params.js';
import {
  depleteResourceNode,
  drainEnergyNode,
  getCharacter,
  addCharacter,
  nextCharacterId,
  removeRemainsById,
  distance,
} from './world.js';
import type { WorldEngine } from './world.js';
import type { ProgramEngine } from './program.js';
import type { ForceMap } from './physics.js';
import type { SpatialGrid } from './spatial-grid.js';
import { computeSpillage, addToGround, groundGridDimensions } from './ground.js';

// ============================================================
// ActionEngine dependencies
// ============================================================
export interface ActionEngineDeps {
  recipeEngine: RecipeEngine;
  worldEngine: WorldEngine;
  characterEngine: CharacterEngine;
  programEngine: ProgramEngine;
}

// ============================================================
// ActionEngine — param-dependent functions (maker pattern)
// ============================================================
export interface ActionEngine {
  executeAction(world: World, characterId: string, action: Action, forces: ForceMap, grid?: SpatialGrid): ActionResult;
}

export function createActionEngine(params: GameParams, deps: ActionEngineDeps): ActionEngine {
  const { recipeEngine, worldEngine, characterEngine, programEngine } = deps;

  function executeAction(
    world: World,
    characterId: string,
    action: Action,
    forces: ForceMap,
    grid?: SpatialGrid,
  ): ActionResult {
    const character = getCharacter(world, characterId);
    if (!character) {
      return { world, characterId, action, success: false, events: [] };
    }

    if (action.op === 'NOOP') {
      const noopCost = params.energyCosts['NOOP'] ?? 0;
      if (noopCost > 0 && character.energy >= noopCost) {
        character.energy -= noopCost;
      }
      return { world, characterId, action, success: true, events: [] };
    }

    const baseCost = getActionEnergyCost(params, action.op);

    if (character.energy < baseCost) {
      return { world, characterId, action, success: false, events: [] };
    }

    const result = executeActionInner(world, character, action, forces, grid);

    if (result.success) {
      const updated = getCharacter(result.world, characterId);
      if (updated) {
        updated.energy = Math.max(0, updated.energy - baseCost);
      }
      return result;
    }

    const penalty = getFailurePenalty(params, baseCost);
    const updatedChar = getCharacter(result.world, characterId);
    if (updatedChar) {
      updatedChar.energy = Math.max(0, updatedChar.energy - penalty);
    }
    return result;
  }

  function executeActionInner(
    world: World,
    character: Character,
    action: Action,
    forces: ForceMap,
    grid?: SpatialGrid,
  ): ActionResult {
    switch (action.op) {
      case 'MOVE':
        return executeMove(world, character, action, forces);
      case 'HARVEST':
        return executeHarvest(world, character, grid);
      case 'RECHARGE':
        return executeRecharge(world, character, grid);
      case 'PROCESS':
        return executeProcess(world, character, action.recipe);
      case 'CRAFT':
        return executeCraft(world, character, action.component);
      case 'ASSEMBLE':
        return executeAssemble(world, character, action.components, grid);
      case 'WRITE':
        return executeWrite(world, character, action.target, grid);
      case 'ACTIVATE':
        return executeActivate(world, character, action.target, grid);
      case 'SENSE':
        return executeSense(world, character, grid);
      case 'REPAIR':
        return executeRepair(world, character);
      case 'DISASSEMBLE':
        return executeDisassemble(world, character, grid);
      default:
        return fail(world, character, action);
    }
  }

  function resolveMoveDirection(direction: MoveDirection, character: Character): number | null {
    if (typeof direction === 'number') return direction;
    return readRegister(character, direction.register);
  }

  function executeMove(
    world: World,
    character: Character,
    action: { op: 'MOVE'; direction: MoveDirection },
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
    const fx = params.moveForce * Math.cos(rad);
    const fy = params.moveForce * Math.sin(rad);

    const existing = forces.get(character.id);
    if (existing) {
      forces.set(character.id, { fx: existing.fx + fx, fy: existing.fy + fy });
    } else {
      forces.set(character.id, { fx, fy });
    }

    return ok(world, character, action);
  }

  function executeHarvest(world: World, character: Character, grid?: SpatialGrid): ActionResult {
    if (!hasComponent(character, 'Harvester')) {
      return fail(world, character, { op: 'HARVEST' });
    }

    const node = worldEngine.findNearestResourceNode(world, character.position, grid);
    if (!node) return fail(world, character, { op: 'HARVEST' });

    const item = node.type === 'OreNode' ? 'Ore' : 'Crystal';
    addItem(character.inventory, item);
    depleteResourceNode(world, node.id);

    return ok(world, character, { op: 'HARVEST' });
  }

  function executeRecharge(world: World, character: Character, grid?: SpatialGrid): ActionResult {
    if (!hasComponent(character, 'Charger')) {
      return fail(world, character, { op: 'RECHARGE' });
    }

    const node = worldEngine.findNearestEnergyNode(world, character.position, grid);
    if (!node) return fail(world, character, { op: 'RECHARGE' });

    const amount = Math.min(params.rechargeAmount, node.stored);
    character.energy += amount;
    drainEnergyNode(world, node.id, amount);

    return ok(world, character, { op: 'RECHARGE' });
  }

  function executeProcess(world: World, character: Character, recipe: string): ActionResult {
    if (!hasComponent(character, 'Assembler')) {
      return fail(world, character, { op: 'PROCESS', recipe: recipe as any });
    }
    const processRecipe = recipeEngine.findProcessRecipe(recipe);
    if (!processRecipe) return fail(world, character, { op: 'PROCESS', recipe: recipe as any });
    if (!hasItems(character.inventory, processRecipe.inputs)) {
      return fail(world, character, { op: 'PROCESS', recipe: recipe as any });
    }

    removeItems(character.inventory, processRecipe.inputs);
    addItem(character.inventory, processRecipe.output);

    return ok(world, character, { op: 'PROCESS', recipe: recipe as any });
  }

  function executeCraft(world: World, character: Character, component: string): ActionResult {
    if (!hasComponent(character, 'Assembler')) {
      return fail(world, character, { op: 'CRAFT', component: component as ComponentType });
    }
    const craftRecipe = recipeEngine.findCraftRecipe(component);
    if (!craftRecipe) return fail(world, character, { op: 'CRAFT', component: component as ComponentType });
    if (!hasItems(character.inventory, craftRecipe.inputs)) {
      return fail(world, character, { op: 'CRAFT', component: component as ComponentType });
    }

    removeItems(character.inventory, craftRecipe.inputs);
    addItem(character.inventory, craftRecipe.output);

    return ok(world, character, { op: 'CRAFT', component: component as ComponentType });
  }

  function executeAssemble(
    world: World,
    character: Character,
    components: ComponentType[],
    grid?: SpatialGrid,
  ): ActionResult {
    if (!hasComponent(character, 'Assembler')) {
      return fail(world, character, { op: 'ASSEMBLE', components });
    }

    const required: Record<string, number> = {};
    for (const c of components) required[c] = (required[c] ?? 0) + 1;
    if (!hasItems(character.inventory, required)) {
      return fail(world, character, { op: 'ASSEMBLE', components });
    }

    const spawnPos = worldEngine.findSpawnPosition(world, character.position, character.velocity, grid);
    if (!spawnPos) return fail(world, character, { op: 'ASSEMBLE', components });

    removeItems(character.inventory, required);

    const childId = nextCharacterId(world);
    const child = characterEngine.createInactiveCharacter(
      childId, spawnPos, components, params.assembleEnergyTransfer, character.species, world.tick,
    );
    addCharacter(world, child);

    return {
      world,
      characterId: character.id,
      action: { op: 'ASSEMBLE', components },
      success: true,
      events: [{ type: 'character_spawned', parentId: character.id, childId }],
    };
  }

  function executeWrite(world: World, character: Character, targetId: string, grid?: SpatialGrid): ActionResult {
    if (!hasComponent(character, 'Processor')) {
      return fail(world, character, { op: 'WRITE', target: targetId });
    }
    if (!character.program) {
      return fail(world, character, { op: 'WRITE', target: targetId });
    }

    const resolved = resolveTarget(targetId, character, world, grid);
    const target = resolved ? getCharacter(world, resolved) : null;
    if (!target) return fail(world, character, { op: 'WRITE', target: targetId });
    if (!target.components.includes('MemoryCore')) {
      return fail(world, character, { op: 'WRITE', target: targetId });
    }

    const programCopy: Program = JSON.parse(JSON.stringify(character.program));
    target.program = programCopy;

    return ok(world, character, { op: 'WRITE', target: targetId });
  }

  function executeActivate(world: World, character: Character, targetId: string, grid?: SpatialGrid): ActionResult {
    if (!hasComponent(character, 'Processor')) {
      return fail(world, character, { op: 'ACTIVATE', target: targetId });
    }

    const resolved = resolveTarget(targetId, character, world, grid);
    const target = resolved ? getCharacter(world, resolved) : null;
    if (!target || !target.program) {
      return fail(world, character, { op: 'ACTIVATE', target: targetId });
    }

    return ok(world, character, { op: 'ACTIVATE', target: targetId });
  }

  function executeSense(world: World, character: Character, grid?: SpatialGrid): ActionResult {
    if (!hasComponent(character, 'Sensor')) {
      return fail(world, character, { op: 'SENSE' });
    }

    const nearestByType: Record<string, { relativePosition: Position }> = {};
    const types: NearbyTargetType[] = [
      'OreNode', 'CrystalNode', 'EnergyNode', 'Character', 'InactiveCharacter', 'Remains',
    ];

    for (const type of types) {
      const targets = programEngine.findTargets(type, character, world, grid);
      let nearest: Position | null = null;
      let minDist = Infinity;
      for (const t of targets) {
        const d = distance(character.position, t);
        if (d <= params.senseRange && d < minDist) {
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

    character.senseData = { nearestByType };
    return ok(world, character, { op: 'SENSE' });
  }

  function executeRepair(world: World, character: Character): ActionResult {
    if (!hasComponent(character, 'Assembler')) {
      return fail(world, character, { op: 'REPAIR' });
    }

    character.durability += params.repairAmount;
    return ok(world, character, { op: 'REPAIR' });
  }

  function disassembleComponent(
    world: World, character: Character, componentName: string, remains: Remains,
  ): void {
    const recipe = recipeEngine.findCraftRecipe(componentName);

    if (recipe) {
      const spillageDef = params.disassembleSpillage[componentName as ComponentType] ?? {};
      const netItems: Record<string, number> = {};
      for (const [item, count] of Object.entries(recipe.inputs)) {
        const loss = spillageDef[item] ?? 0;
        const net = count - loss;
        if (net > 0) netItems[item] = net;
      }
      addItems(character.inventory, netItems);

      const spill = computeSpillage(componentName, params);
      if (spill.ore > 0 || spill.crystal > 0) {
        const { gridWidth, gridHeight } = groundGridDimensions(world);
        addToGround(world.groundGrid, gridWidth, gridHeight, remains.position, spill.ore, spill.crystal);
      }
    } else {
      addItem(character.inventory, componentName);
    }
  }

  function executeDisassemble(world: World, character: Character, grid?: SpatialGrid): ActionResult {
    if (!hasComponent(character, 'Disassembler')) {
      return fail(world, character, { op: 'DISASSEMBLE' });
    }

    const remains = worldEngine.findNearestRemains(world, character.position, grid);
    if (!remains) return fail(world, character, { op: 'DISASSEMBLE' });

    const invEntries = Object.entries(remains.inventory)
      .filter(([, count]) => count > 0)
      .sort(([a], [b]) => a.localeCompare(b));

    if (invEntries.length > 0) {
      const [itemName] = invEntries[0];
      remains.inventory[itemName] = (remains.inventory[itemName] ?? 0) - 1;
      if (remains.inventory[itemName] <= 0) delete remains.inventory[itemName];

      if (isComponentType(itemName)) {
        disassembleComponent(world, character, itemName, remains);
      } else {
        addItem(character.inventory, itemName);
      }

      const isEmpty = Object.keys(remains.inventory).length === 0 && remains.components.length === 0;
      if (isEmpty) removeRemainsById(world, remains.id);

      return ok(world, character, { op: 'DISASSEMBLE' });
    }

    if (remains.components.length > 0) {
      const sorted = [...remains.components].sort((a, b) => a.localeCompare(b));
      const componentName = sorted[0];
      const idx = remains.components.indexOf(componentName);
      remains.components.splice(idx, 1);

      disassembleComponent(world, character, componentName, remains);

      const isEmpty = remains.components.length === 0 && Object.keys(remains.inventory).length === 0;
      if (isEmpty) removeRemainsById(world, remains.id);

      return ok(world, character, { op: 'DISASSEMBLE' });
    }

    return fail(world, character, { op: 'DISASSEMBLE' });
  }

  function resolveTarget(targetId: string, character: Character, world: World, grid?: SpatialGrid): string | null {
    if (targetId === 'nearest_inactive') {
      const target = worldEngine.findNearestInactiveCharacter(world, character.position, character.id, grid);
      return target?.id ?? null;
    }
    const target = getCharacter(world, targetId);
    if (target && distance(character.position, target.position) <= params.interactRange) {
      return targetId;
    }
    return null;
  }

  return { executeAction };
}

// ============================================================
// Helpers (param-independent)
// ============================================================
function ok(world: World, character: Character, action: Action): ActionResult {
  return { world, characterId: character.id, action, success: true, events: [] };
}

function fail(world: World, character: Character, action: Action): ActionResult {
  return { world, characterId: character.id, action, success: false, events: [] };
}
