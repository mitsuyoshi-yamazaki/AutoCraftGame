/**
 * Action Executor — executes reserved actions from I/O handler.
 *
 * Key differences from v3:
 * - Actions come from I/O reservations (not Program rules)
 * - Multiple actions per tick (different component types simultaneously)
 * - WRITE uses local ID + block copy (src_addr, dst_addr, length)
 * - DISASSEMBLE/ACTIVATE/WRITE target by local ID
 * - HARVEST/RECHARGE still use nearest target
 */

import type {
  Character,
  ComponentType,
  World,
  ActionRecord,
  SimulationEvent,
} from './types.js';
import { hasComponent } from './character.js';
import type { CharacterEngine } from './character.js';
import {
  hasItems,
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
  updateCharacter,
  addCharacter,
  nextCharacterId,
  updateRemains,
  distance,
} from './world.js';
import type { WorldEngine } from './world.js';
import type { ForceMap } from './physics.js';
import { addForce } from './physics.js';
import type { SpatialGrid } from './spatial-grid.js';
import { computeSpillage, addToGround, groundGridDimensions } from './ground.js';
import type {
  ActionReservation,
  MoveReservation,
  HarvestReservation,
  RechargeReservation,
  ProcessReservation,
  CraftReservation,
  AssembleReservation,
  RepairReservation,
  WriteReservation,
  ActivateReservation,
  DisassembleReservation,
  SenseReservation,
} from './io.js';

// ============================================================
// ActionEngine dependencies
// ============================================================
export interface ActionEngineDeps {
  recipeEngine: RecipeEngine;
  worldEngine: WorldEngine;
  characterEngine: CharacterEngine;
}

// ============================================================
// Action execution result
// ============================================================
export interface ActionExecResult {
  readonly world: World;
  readonly records: readonly ActionRecord[];
  readonly events: readonly SimulationEvent[];
  readonly updatedLocalIdTable: ReadonlyMap<number, string>;
}

// ============================================================
// Recipe / component encoding (matching io.ts)
// ============================================================
const RECIPE_METAL   = 1;
const RECIPE_CIRCUIT = 2;

const CRAFT_FRAME        = 1;
const CRAFT_ACTUATOR     = 2;
const CRAFT_SENSOR       = 3;
const CRAFT_PROCESSOR    = 4;
const CRAFT_HARVESTER    = 5;
const CRAFT_ASSEMBLER    = 6;
const CRAFT_DISASSEMBLER = 7;
const CRAFT_CHARGER      = 8;
const CRAFT_MEMORYCORE   = 9;

function recipeIdToName(id: number): string | null {
  switch (id) {
    case RECIPE_METAL:   return 'Metal';
    case RECIPE_CIRCUIT: return 'Circuit';
    default: return null;
  }
}

function craftIdToName(id: number): ComponentType | null {
  switch (id) {
    case CRAFT_FRAME:        return 'Frame';
    case CRAFT_ACTUATOR:     return 'Actuator';
    case CRAFT_SENSOR:       return 'Sensor';
    case CRAFT_PROCESSOR:    return 'Processor';
    case CRAFT_HARVESTER:    return 'Harvester';
    case CRAFT_ASSEMBLER:    return 'Assembler';
    case CRAFT_DISASSEMBLER: return 'Disassembler';
    case CRAFT_CHARGER:      return 'Charger';
    case CRAFT_MEMORYCORE:   return 'MemoryCore';
    default: return null;
  }
}

// ============================================================
// ActionEngine
// ============================================================
export interface ActionEngine {
  executeReservations(
    world: World,
    characterId: string,
    reservations: readonly ActionReservation[],
    localIdTable: ReadonlyMap<number, string>,
    forces: ForceMap,
    grid?: SpatialGrid,
  ): ActionExecResult;
}

export function createActionEngine(
  params: GameParams,
  deps: ActionEngineDeps,
): ActionEngine {
  const { recipeEngine, worldEngine, characterEngine } = deps;

  function executeReservations(
    world: World,
    characterId: string,
    reservations: readonly ActionReservation[],
    localIdTable: ReadonlyMap<number, string>,
    forces: ForceMap,
    grid?: SpatialGrid,
  ): ActionExecResult {
    let currentWorld = world;
    const records: ActionRecord[] = [];
    const events: SimulationEvent[] = [];
    const mutableIdTable = new Map(localIdTable);

    for (const reservation of reservations) {
      const character = getCharacter(currentWorld, characterId);
      if (!character) break;

      const result = executeSingleReservation(
        currentWorld, character, reservation, mutableIdTable, forces, grid,
      );
      currentWorld = result.world;
      records.push(result.record);
      events.push(...result.events);
    }

    return {
      world: currentWorld,
      records,
      events,
      updatedLocalIdTable: mutableIdTable,
    };
  }

  interface SingleResult {
    readonly world: World;
    readonly record: ActionRecord;
    readonly events: readonly SimulationEvent[];
  }

  function executeSingleReservation(
    world: World,
    character: Character,
    reservation: ActionReservation,
    localIdTable: Map<number, string>,
    forces: ForceMap,
    grid?: SpatialGrid,
  ): SingleResult {
    const op = reservationToActionOp(reservation);
    const baseCost = getActionEnergyCostForReservation(reservation);

    if (character.energy < baseCost) {
      return {
        world,
        record: { op, success: false },
        events: [],
      };
    }

    const result = executeInner(
      world, character, reservation, localIdTable, forces, grid,
    );

    if (result.success) {
      const updated = getCharacter(result.world, character.id);
      if (updated) {
        const newWorld = updateCharacter(
          result.world,
          { ...updated, energy: Math.max(0, updated.energy - baseCost) },
        );
        return { world: newWorld, record: { op, success: true }, events: result.events };
      }
      return { world: result.world, record: { op, success: true }, events: result.events };
    }

    const penalty = getFailurePenalty(params, baseCost);
    const updatedChar = getCharacter(result.world, character.id);
    if (updatedChar) {
      const newWorld = updateCharacter(
        result.world,
        { ...updatedChar, energy: Math.max(0, updatedChar.energy - penalty) },
      );
      return { world: newWorld, record: { op, success: false }, events: result.events };
    }
    return { world: result.world, record: { op, success: false }, events: result.events };
  }

  function reservationToActionOp(r: ActionReservation): ActionRecord['op'] {
    return r.op as ActionRecord['op'];
  }

  function getActionEnergyCostForReservation(r: ActionReservation): number {
    if (r.op === 'WRITE') {
      const base = params.energyCosts['WRITE'] ?? 0;
      return base + Math.ceil(r.length * params.writeCostPerWord);
    }
    return getActionEnergyCost(params, r.op);
  }

  interface InnerResult {
    readonly world: World;
    readonly success: boolean;
    readonly events: readonly SimulationEvent[];
  }

  function executeInner(
    world: World,
    character: Character,
    reservation: ActionReservation,
    localIdTable: Map<number, string>,
    forces: ForceMap,
    grid?: SpatialGrid,
  ): InnerResult {
    switch (reservation.op) {
      case 'MOVE':
        return executeMove(world, character, reservation, forces);
      case 'HARVEST':
        return executeHarvest(world, character, grid);
      case 'RECHARGE':
        return executeRecharge(world, character, grid);
      case 'PROCESS':
        return executeProcess(world, character, reservation);
      case 'CRAFT':
        return executeCraft(world, character, reservation);
      case 'ASSEMBLE':
        return executeAssemble(world, character, reservation, localIdTable, grid);
      case 'REPAIR':
        return executeRepair(world, character);
      case 'WRITE':
        return executeWrite(world, character, reservation, localIdTable, grid);
      case 'ACTIVATE':
        return executeActivate(world, character, reservation, localIdTable, grid);
      case 'DISASSEMBLE':
        return executeDisassemble(world, character, reservation, localIdTable, grid);
      case 'SENSE':
        // SENSE was already executed immediately in the I/O handler.
        // This reservation exists only for energy cost tracking.
        return executeSense(world, character);
    }
  }

  function executeMove(
    world: World,
    character: Character,
    reservation: MoveReservation,
    forces: ForceMap,
  ): InnerResult {
    if (!hasComponent(character, 'Actuator')) {
      return { world, success: false, events: [] };
    }

    const angleDeg = reservation.direction;
    const rad = (angleDeg * Math.PI) / 180;
    const fx = params.moveForce * Math.cos(rad);
    const fy = params.moveForce * Math.sin(rad);

    addForce(forces, character.id, { fx, fy });
    return { world, success: true, events: [] };
  }

  function executeSense(world: World, character: Character): InnerResult {
    // SENSE was already executed in the I/O handler.
    // Just check prerequisite (Sensor component).
    if (!hasComponent(character, 'Sensor')) {
      return { world, success: false, events: [] };
    }
    return { world, success: true, events: [] };
  }

  function executeHarvest(
    world: World,
    character: Character,
    grid?: SpatialGrid,
  ): InnerResult {
    if (!hasComponent(character, 'Harvester')) {
      return { world, success: false, events: [] };
    }

    const node = worldEngine.findNearestResourceNode(world, character.position, grid);
    if (!node) return { world, success: false, events: [] };

    const item = node.type === 'OreNode' ? 'Ore' : 'Crystal';
    const updated = { ...character, inventory: addItem(character.inventory, item) };
    let newWorld = depleteResourceNode(world, node.id);
    newWorld = updateCharacter(newWorld, updated);
    return { world: newWorld, success: true, events: [] };
  }

  function executeRecharge(
    world: World,
    character: Character,
    grid?: SpatialGrid,
  ): InnerResult {
    if (!hasComponent(character, 'Charger')) {
      return { world, success: false, events: [] };
    }

    const node = worldEngine.findNearestEnergyNode(world, character.position, grid);
    if (!node) return { world, success: false, events: [] };

    const amount = Math.min(params.rechargeAmount, node.stored);
    const updated = { ...character, energy: character.energy + amount };
    let newWorld = drainEnergyNode(world, node.id, amount);
    newWorld = updateCharacter(newWorld, updated);
    return { world: newWorld, success: true, events: [] };
  }

  function executeProcess(
    world: World,
    character: Character,
    reservation: ProcessReservation,
  ): InnerResult {
    if (!hasComponent(character, 'Assembler')) {
      return { world, success: false, events: [] };
    }

    const recipeName = recipeIdToName(reservation.recipe);
    if (!recipeName) return { world, success: false, events: [] };

    const processRecipe = recipeEngine.findProcessRecipe(recipeName);
    if (!processRecipe) return { world, success: false, events: [] };

    if (!hasItems(character.inventory, processRecipe.inputs)) {
      return { world, success: false, events: [] };
    }

    let inv = removeItems(character.inventory, processRecipe.inputs);
    inv = addItem(inv, processRecipe.output);
    const updated = { ...character, inventory: inv };
    return { world: updateCharacter(world, updated), success: true, events: [] };
  }

  function executeCraft(
    world: World,
    character: Character,
    reservation: CraftReservation,
  ): InnerResult {
    if (!hasComponent(character, 'Assembler')) {
      return { world, success: false, events: [] };
    }

    const componentName = craftIdToName(reservation.componentType);
    if (!componentName) return { world, success: false, events: [] };

    const craftRecipe = recipeEngine.findCraftRecipe(componentName);
    if (!craftRecipe) return { world, success: false, events: [] };

    if (!hasItems(character.inventory, craftRecipe.inputs)) {
      return { world, success: false, events: [] };
    }

    let inv = removeItems(character.inventory, craftRecipe.inputs);
    inv = addItem(inv, craftRecipe.output);
    const updated = { ...character, inventory: inv };
    return { world: updateCharacter(world, updated), success: true, events: [] };
  }

  function executeAssemble(
    world: World,
    character: Character,
    reservation: AssembleReservation,
    localIdTable: Map<number, string>,
    grid?: SpatialGrid,
  ): InnerResult {
    if (!hasComponent(character, 'Assembler')) {
      return { world, success: false, events: [] };
    }

    const components = reservation.components;
    if (components.length === 0) {
      return { world, success: false, events: [] };
    }

    // Check that required components are in inventory
    const required: Record<string, number> = {};
    for (const c of components) required[c] = (required[c] ?? 0) + 1;
    if (!hasItems(character.inventory, required)) {
      return { world, success: false, events: [] };
    }

    // Find spawn position
    const spawnPos = worldEngine.findSpawnPosition(
      world, character.position, character.velocity, grid,
    );
    if (!spawnPos) return { world, success: false, events: [] };

    // Remove components from inventory
    const inv = removeItems(character.inventory, required);
    const updatedParent = { ...character, inventory: inv };

    // Create child character
    const { id: childId, world: worldWithId } = nextCharacterId(world);
    const child = characterEngine.createInactiveCharacter(
      childId, spawnPos, components,
      params.assembleEnergyTransfer, character.species, world.tick,
    );

    let newWorld = updateCharacter(worldWithId, updatedParent);
    newWorld = addCharacter(newWorld, child);

    // Update local ID table: replace placeholder with actual child system ID
    localIdTable.set(reservation.childLocalId, childId);

    return {
      world: newWorld,
      success: true,
      events: [{ type: 'character_spawned', parentId: character.id, childId }],
    };
  }

  function executeRepair(world: World, character: Character): InnerResult {
    if (!hasComponent(character, 'Assembler')) {
      return { world, success: false, events: [] };
    }

    const frameCount = character.components.filter(c => c === 'Frame').length;
    const maxDurability = frameCount * params.frameDurability;
    const newDurability = Math.min(
      character.durability + params.repairAmount,
      maxDurability,
    );
    const updated = { ...character, durability: newDurability };
    return { world: updateCharacter(world, updated), success: true, events: [] };
  }

  function resolveLocalId(
    localId: number,
    localIdTable: Map<number, string>,
  ): string | null {
    return localIdTable.get(localId) ?? null;
  }

  function executeWrite(
    world: World,
    character: Character,
    reservation: WriteReservation,
    localIdTable: Map<number, string>,
    grid?: SpatialGrid,
  ): InnerResult {
    if (!hasComponent(character, 'Processor')) {
      return { world, success: false, events: [] };
    }

    const targetSystemId = resolveLocalId(reservation.targetLocalId, localIdTable);
    if (!targetSystemId) return { world, success: false, events: [] };

    const target = getCharacter(world, targetSystemId);
    if (!target) return { world, success: false, events: [] };

    // Range check
    if (distance(character.position, target.position) > params.interactRange) {
      return { world, success: false, events: [] };
    }

    // Target must have MemoryCore
    if (!target.components.includes('MemoryCore')) {
      return { world, success: false, events: [] };
    }

    // Block copy: src memory -> target memory
    const srcMemory = character.vm.memory;
    const dstMemory = [...target.vm.memory];
    const srcSize = srcMemory.length;
    const dstSize = dstMemory.length;

    if (srcSize === 0 || dstSize === 0) {
      return { world, success: false, events: [] };
    }

    const length = reservation.length;
    for (let i = 0; i < length; i++) {
      const srcAddr = ((reservation.srcAddr + i) % srcSize + srcSize) % srcSize;
      const dstAddr = ((reservation.dstAddr + i) % dstSize + dstSize) % dstSize;
      dstMemory[dstAddr] = srcMemory[srcAddr];
    }

    const updatedTarget: Character = {
      ...target,
      vm: { ...target.vm, memory: dstMemory },
    };
    return { world: updateCharacter(world, updatedTarget), success: true, events: [] };
  }

  function executeActivate(
    world: World,
    character: Character,
    reservation: ActivateReservation,
    localIdTable: Map<number, string>,
    grid?: SpatialGrid,
  ): InnerResult {
    if (!hasComponent(character, 'Processor')) {
      return { world, success: false, events: [] };
    }

    const targetSystemId = resolveLocalId(reservation.targetLocalId, localIdTable);
    if (!targetSystemId) return { world, success: false, events: [] };

    const target = getCharacter(world, targetSystemId);
    if (!target) return { world, success: false, events: [] };

    // Range check
    if (distance(character.position, target.position) > params.interactRange) {
      return { world, success: false, events: [] };
    }

    // Target must be inactive
    if (target.vm.active) {
      return { world, success: false, events: [] };
    }

    const updatedTarget: Character = {
      ...target,
      vm: { ...target.vm, active: true, pc: 0 },
    };
    return { world: updateCharacter(world, updatedTarget), success: true, events: [] };
  }

  function executeDisassemble(
    world: World,
    character: Character,
    reservation: DisassembleReservation,
    localIdTable: Map<number, string>,
    grid?: SpatialGrid,
  ): InnerResult {
    if (!hasComponent(character, 'Disassembler')) {
      return { world, success: false, events: [] };
    }

    const targetSystemId = resolveLocalId(reservation.targetLocalId, localIdTable);
    if (!targetSystemId) return { world, success: false, events: [] };

    const remains = world.remains.find(r => r.id === targetSystemId);
    if (!remains) return { world, success: false, events: [] };

    // Range check
    if (distance(character.position, remains.position) > params.interactRange) {
      return { world, success: false, events: [] };
    }

    // Try inventory items first (alphabetical order)
    const invEntries = Object.entries(remains.inventory)
      .filter(([, count]) => count > 0)
      .sort(([a], [b]) => a.localeCompare(b));

    if (invEntries.length > 0) {
      const [itemName] = invEntries[0];
      const newRemainsInv = {
        ...remains.inventory,
        [itemName]: (remains.inventory[itemName] ?? 0) - 1,
      };
      if (newRemainsInv[itemName] <= 0) delete newRemainsInv[itemName];

      const { updatedChar, updatedWorld } = disassembleItem(
        world, character, itemName, remains,
      );

      const newRemains = { ...remains, inventory: newRemainsInv };
      const isEmpty = Object.keys(newRemainsInv).length === 0
        && newRemains.components.length === 0;

      let newWorld = updateCharacter(updatedWorld, updatedChar);
      newWorld = updateRemains(newWorld, remains, isEmpty ? null : newRemains);
      return { world: newWorld, success: true, events: [] };
    }

    // Then components (alphabetical order)
    if (remains.components.length > 0) {
      const sorted = [...remains.components].sort((a, b) => a.localeCompare(b));
      const componentName = sorted[0];
      const idx = remains.components.indexOf(componentName);
      const newComponents = [...remains.components];
      newComponents.splice(idx, 1);

      const { updatedChar, updatedWorld } = disassembleComponent(
        world, character, componentName, remains,
      );

      const isEmpty = newComponents.length === 0
        && Object.keys(remains.inventory).length === 0;
      const newRemains = { ...remains, components: newComponents };

      let newWorld = updateCharacter(updatedWorld, updatedChar);
      newWorld = updateRemains(newWorld, remains, isEmpty ? null : newRemains);
      return { world: newWorld, success: true, events: [] };
    }

    return { world, success: false, events: [] };
  }

  function disassembleItem(
    world: World,
    character: Character,
    itemName: string,
    remains: { readonly position: { readonly x: number; readonly y: number } },
  ): { updatedChar: Character; updatedWorld: World } {
    // Non-component items: just add to inventory, no spillage
    const updatedChar = {
      ...character,
      inventory: addItem(character.inventory, itemName),
    };
    return { updatedChar, updatedWorld: world };
  }

  function disassembleComponent(
    world: World,
    character: Character,
    componentName: string,
    remains: { readonly position: { readonly x: number; readonly y: number } },
  ): { updatedChar: Character; updatedWorld: World } {
    const recipe = recipeEngine.findCraftRecipe(componentName);
    let updatedChar: Character;
    let updatedWorld = world;

    if (recipe) {
      // Net items = recipe inputs - spillage
      const spillageDef = params.disassembleSpillage[componentName as ComponentType] ?? {};
      const netItems: Record<string, number> = {};
      for (const [item, count] of Object.entries(recipe.inputs)) {
        const loss = spillageDef[item] ?? 0;
        const net = count - loss;
        if (net > 0) netItems[item] = net;
      }
      updatedChar = { ...character, inventory: addItems(character.inventory, netItems) };

      // Add spillage to ground
      const spill = computeSpillage(componentName, params);
      if (spill.ore > 0 || spill.crystal > 0) {
        const { gridWidth, gridHeight } = groundGridDimensions(world);
        updatedWorld = {
          ...updatedWorld,
          groundGrid: addToGround(
            updatedWorld.groundGrid, gridWidth, gridHeight,
            remains.position, spill.ore, spill.crystal,
          ),
        };
      }
    } else {
      updatedChar = { ...character, inventory: addItem(character.inventory, componentName) };
    }

    return { updatedChar, updatedWorld };
  }

  return { executeReservations };
}
