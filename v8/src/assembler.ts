/**
 * Assembler Component (v8) — ASSEMBLE with connection target + DISCONNECT.
 *
 * Opmem layout (8 words):
 *   0: assemble_trigger   (W)  1 = start/retrigger
 *   1: recipe             (R/W) 1-4, 0 = unset
 *   2: connection_target_id (R/W) objectId to connect to (0 = none)
 *   3: assemble_status    (R)   0=idle, 1=gathering, 2=assembling
 *   4: assemble_progress  (R)   remaining ticks
 *   5: last_product_id    (R)   set at ejection
 *   6: disconnect_trigger (W)   1 = execute in component action phase
 *   7: disconnect_target_id (R/W) objectId to disconnect
 */

import type {
  World,
  WorldObject,
  AssemblerObject,
  EnergyObject,
  MaterialObject,
  ProcessorObject,
  SimulationEvent,
  Position,
  MaterialType,
  ComponentObject,
  Recipe,
} from './types.js';
import {
  ASSEMBLER_OPMEM_SIZE,
  ASM_OFF_ASSEMBLE_TRIGGER,
  ASM_OFF_RECIPE,
  ASM_OFF_CONNECTION_TARGET_ID,
  ASM_OFF_ASSEMBLE_STATUS,
  ASM_OFF_ASSEMBLE_PROGRESS,
  ASM_OFF_LAST_PRODUCT_ID,
  PROCESSOR_OPMEM_SIZE,
} from './types.js';
import type { GameParams } from './params.js';
import { getRecipeById } from './params.js';
import {
  nextObjectId,
  findNearbyObjects,
  replaceObject,
  addObject,
  removeObject,
  getObject,
  effectivePosition,
  isAccessible,
  createGroupWith,
  addMemberToGroup,
} from './world.js';

export { ASSEMBLER_OPMEM_SIZE };

// ============================================================
// Create fresh Assembler
// ============================================================
export function createAssembler(
  id: number,
  position: Position,
  recipe: number = 0,
  phase: 'idle' | 'gathering' = 'idle',
): AssemblerObject {
  const isGathering = phase === 'gathering' && recipe > 0;
  const opmem = new Array<number>(ASSEMBLER_OPMEM_SIZE).fill(0);
  opmem[ASM_OFF_RECIPE] = recipe;
  opmem[ASM_OFF_ASSEMBLE_STATUS] = isGathering ? 1 : 0;
  return {
    id,
    kind: 'assembler',
    position,
    orientation: 0,
    groupId: null,
    operationMemory: opmem,
    phase: isGathering ? 'gathering' : 'idle',
    recipe,
    gatherProgress: {},
    gatheredEnergy: 0,
    assembleTicksRemaining: 0,
  };
}

// ============================================================
// Execute one tick for an Assembler
// ============================================================
export function executeAssemblerTick(
  world: World,
  assemblerId: number,
  params: GameParams,
): { world: World; events: SimulationEvent[] } {
  const asm = getObject(world, assemblerId) as AssemblerObject | undefined;
  if (!asm || asm.kind !== 'assembler') return { world, events: [] };

  const events: SimulationEvent[] = [];
  let currentWorld = world;
  let updatedAsm = asm;

  const trigger = asm.operationMemory[ASM_OFF_ASSEMBLE_TRIGGER];
  const recipe = asm.operationMemory[ASM_OFF_RECIPE];

  if (trigger === 1 && recipe > 0) {
    const recipeData = getRecipeById(params, recipe);
    if (recipeData) {
      if (updatedAsm.phase !== 'idle') {
        currentWorld = ejectUnneededMaterials(currentWorld, updatedAsm, recipeData);
        updatedAsm = getObject(currentWorld, assemblerId) as AssemblerObject;
      }
      updatedAsm = {
        ...updatedAsm,
        phase: 'gathering',
        recipe,
        gatherProgress: {},
        gatheredEnergy: 0,
        assembleTicksRemaining: 0,
        operationMemory: updateOpMem(updatedAsm.operationMemory, {
          assembleStatus: 1,
          assembleProgress: 0,
          lastProductId: 0,
        }),
      };
      events.push({ type: 'assembler_started', id: assemblerId, recipe });
    }
  }

  // Process current phase
  if (updatedAsm.phase === 'gathering') {
    const recipeData = getRecipeById(params, updatedAsm.recipe);
    if (recipeData) {
      const gatherResult = gatherMaterials(currentWorld, updatedAsm, recipeData, params);
      currentWorld = gatherResult.world;
      updatedAsm = gatherResult.assembler;

      if (isGatheringComplete(updatedAsm, recipeData)) {
        updatedAsm = {
          ...updatedAsm,
          phase: 'assembling',
          assembleTicksRemaining: recipeData.assembleTicks,
          operationMemory: updateOpMem(updatedAsm.operationMemory, {
            assembleStatus: 2,
            assembleProgress: recipeData.assembleTicks,
          }),
        };
      }
    }
  } else if (updatedAsm.phase === 'assembling') {
    const remaining = updatedAsm.assembleTicksRemaining - 1;
    if (remaining <= 0) {
      const recipeData = getRecipeById(params, updatedAsm.recipe);
      if (recipeData) {
        const ejectResult = ejectProduct(currentWorld, updatedAsm, recipeData, params);
        currentWorld = ejectResult.world;
        const reloaded = getObject(currentWorld, assemblerId) as AssemblerObject;
        updatedAsm = {
          ...reloaded,
          phase: 'idle',
          recipe: 0,
          gatherProgress: {},
          gatheredEnergy: 0,
          assembleTicksRemaining: 0,
          operationMemory: updateOpMem(reloaded.operationMemory, {
            assembleStatus: 0,
            assembleProgress: 0,
            recipe: 0,
            lastProductId: ejectResult.productId,
          }),
        };
        events.push({ type: 'assembler_completed', id: assemblerId, productId: ejectResult.productId });
      }
    } else {
      updatedAsm = {
        ...updatedAsm,
        assembleTicksRemaining: remaining,
        operationMemory: updateOpMem(updatedAsm.operationMemory, { assembleProgress: remaining }),
      };
    }
  }

  // Always clear assemble_trigger
  updatedAsm = {
    ...updatedAsm,
    operationMemory: updateOpMem(updatedAsm.operationMemory, { assembleTrigger: 0 }),
  };

  currentWorld = replaceObject(currentWorld, updatedAsm);
  return { world: currentWorld, events };
}

// ============================================================
// Gather materials from nearby objects (uses effective position)
// ============================================================
function gatherMaterials(
  world: World,
  asm: AssemblerObject,
  recipe: Recipe,
  params: GameParams,
): { world: World; assembler: AssemblerObject } {
  let currentWorld = world;
  const gatherProgress: Record<string, number> = { ...asm.gatherProgress };
  let gatheredEnergy = asm.gatheredEnergy;
  let absorbed = 0;

  const pos = effectivePosition(world, asm);
  const nearby = findNearbyObjects(world, pos, params.proximityRange, asm.id);

  for (const [matType, needed] of Object.entries(recipe.inputs)) {
    const have = gatherProgress[matType] ?? 0;
    if (have >= needed) continue;

    for (const obj of nearby) {
      if (absorbed >= params.absorptionPerTick) break;
      if (obj.kind !== 'material') continue;
      const mat = obj as MaterialObject;
      if (mat.materialType !== matType) continue;

      const newAmount = mat.amount - 1;
      if (newAmount <= 0) {
        currentWorld = removeObject(currentWorld, mat.id);
      } else {
        currentWorld = replaceObject(currentWorld, { ...mat, amount: newAmount });
      }
      gatherProgress[matType] = (gatherProgress[matType] ?? 0) + 1;
      absorbed++;
      if ((gatherProgress[matType] ?? 0) >= needed) break;
    }
  }

  if (gatheredEnergy < recipe.energyCost && absorbed < params.absorptionPerTick) {
    for (const obj of nearby) {
      if (absorbed >= params.absorptionPerTick) break;
      if (obj.kind !== 'energy') continue;
      const eng = obj as EnergyObject;

      const take = Math.min(eng.amount, recipe.energyCost - gatheredEnergy, params.absorptionPerTick - absorbed);
      const newAmount = eng.amount - take;
      if (newAmount <= 0) {
        currentWorld = removeObject(currentWorld, eng.id);
      } else {
        currentWorld = replaceObject(currentWorld, { ...eng, amount: newAmount });
      }
      gatheredEnergy += take;
      absorbed += take;
    }
  }

  const updatedAsm: AssemblerObject = {
    ...asm,
    gatherProgress,
    gatheredEnergy,
  };
  currentWorld = replaceObject(currentWorld, updatedAsm);

  return { world: currentWorld, assembler: updatedAsm };
}

function isGatheringComplete(asm: AssemblerObject, recipe: Recipe): boolean {
  for (const [matType, needed] of Object.entries(recipe.inputs)) {
    if ((asm.gatherProgress[matType] ?? 0) < needed) return false;
  }
  return asm.gatheredEnergy >= recipe.energyCost;
}

// ============================================================
// Eject product (with optional connection)
// ============================================================
function ejectProduct(
  world: World,
  asm: AssemblerObject,
  recipe: Recipe,
  params: GameParams,
): { world: World; productId: number } {
  const { id: productId, world: w } = nextObjectId(world);
  let currentWorld = w;

  const asmPos = effectivePosition(currentWorld, asm);
  const ejectDist = 1.0;
  const rad = (asm.orientation * Math.PI) / 180;
  const freestandingPos: Position = {
    x: asmPos.x + Math.cos(rad) * ejectDist,
    y: asmPos.y + Math.sin(rad) * ejectDist,
  };

  const targetId = asm.operationMemory[ASM_OFF_CONNECTION_TARGET_ID];
  let connectToComponentId: number | null = null;
  if (targetId !== 0 && isAccessible(currentWorld, asm.id, targetId, params.proximityRange)) {
    const target = getObject(currentWorld, targetId);
    if (target && (target.kind === 'assembler' || target.kind === 'processor')) {
      connectToComponentId = targetId;
    }
  }

  // Material products: always freestanding
  if (recipe.outputKind === 'material') {
    const mat: MaterialObject = {
      id: productId, kind: 'material',
      position: freestandingPos, orientation: 0,
      materialType: recipe.outputMaterialType!,
      amount: 1,
    };
    currentWorld = addObject(currentWorld, mat);
    return { world: currentWorld, productId };
  }

  const productPos: Position = connectToComponentId !== null ? { x: 0, y: 0 } : freestandingPos;
  let product: WorldObject;
  if (recipe.outputKind === 'assembler') {
    product = createAssembler(productId, productPos);
  } else {
    product = createEmptyProcessor(productId, productPos);
  }
  currentWorld = addObject(currentWorld, product);

  if (connectToComponentId !== null) {
    const target = getObject(currentWorld, connectToComponentId) as ComponentObject;
    if (target.groupId !== null) {
      currentWorld = addMemberToGroup(currentWorld, target.groupId, productId, connectToComponentId);
    } else {
      const { world: w2 } = createGroupWith(currentWorld, connectToComponentId, productId, effectivePosition(currentWorld, target));
      currentWorld = w2;
    }
  }

  return { world: currentWorld, productId };
}

// ============================================================
// Eject unneeded materials on re-trigger
// ============================================================
function ejectUnneededMaterials(
  world: World,
  asm: AssemblerObject,
  newRecipe: Recipe,
): World {
  let currentWorld = world;
  const ejectDist = 1.0;
  const rad = (asm.orientation * Math.PI) / 180;
  const asmPos = effectivePosition(world, asm);

  for (const [matType, gathered] of Object.entries(asm.gatherProgress)) {
    const needed = newRecipe.inputs[matType] ?? 0;
    const excess = gathered - needed;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        const { id, world: w } = nextObjectId(currentWorld);
        currentWorld = w;
        const pos = {
          x: asmPos.x + Math.cos(rad) * ejectDist,
          y: asmPos.y + Math.sin(rad) * ejectDist,
        };
        currentWorld = addObject(currentWorld, {
          id, kind: 'material', position: pos, orientation: 0,
          materialType: matType as MaterialType, amount: 1,
        });
      }
    }
  }

  const excessEnergy = asm.gatheredEnergy - newRecipe.energyCost;
  if (excessEnergy > 0) {
    const { id, world: w } = nextObjectId(currentWorld);
    currentWorld = w;
    const pos = {
      x: asmPos.x + Math.cos(rad) * ejectDist,
      y: asmPos.y + Math.sin(rad) * ejectDist,
    };
    currentWorld = addObject(currentWorld, {
      id, kind: 'energy', position: pos, orientation: 0, amount: excessEnergy,
    });
  }

  return currentWorld;
}

// ============================================================
// Helpers
// ============================================================
function updateOpMem(
  mem: readonly number[],
  updates: {
    assembleTrigger?: number;
    recipe?: number;
    assembleStatus?: number;
    assembleProgress?: number;
    lastProductId?: number;
  },
): readonly number[] {
  const m = [...mem];
  if (updates.assembleTrigger !== undefined) m[ASM_OFF_ASSEMBLE_TRIGGER] = updates.assembleTrigger;
  if (updates.recipe !== undefined) m[ASM_OFF_RECIPE] = updates.recipe;
  if (updates.assembleStatus !== undefined) m[ASM_OFF_ASSEMBLE_STATUS] = updates.assembleStatus;
  if (updates.assembleProgress !== undefined) m[ASM_OFF_ASSEMBLE_PROGRESS] = updates.assembleProgress;
  if (updates.lastProductId !== undefined) m[ASM_OFF_LAST_PRODUCT_ID] = updates.lastProductId;
  return m;
}

function createEmptyProcessor(id: number, position: Position): ProcessorObject {
  return {
    id, kind: 'processor', position, orientation: 0,
    groupId: null,
    operationMemory: new Array(PROCESSOR_OPMEM_SIZE).fill(0),
    running: false,
    memory: new Array(1024).fill(0),
    registers: [0, 0, 0, 0, 0, 0, 0, 0],
    pc: 0,
    localIdTable: new Map(),
    localIdCounter: 1,
    ioRegisters: { opMemTargetId: 0, opMemOffset: 0, pmemTargetId: 0, pmemAddr: 0 },
  };
}
