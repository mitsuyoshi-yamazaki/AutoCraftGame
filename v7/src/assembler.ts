/**
 * Assembler Component — handles ASSEMBLE action lifecycle.
 *
 * States: idle → gathering → assembling → idle (product ejected)
 *
 * Operation memory layout (5 words):
 *   0: current_action  (R)   0=none, 1=ASSEMBLE
 *   1: action_trigger   (W)  1=start ASSEMBLE. Cleared next tick
 *   2: recipe           (R/W) recipe ID (1-4), 0=unset
 *   3: assemble_status  (R)   0=idle, 1=gathering, 2=assembling
 *   4: assemble_progress(R)   remaining ticks (assembling only)
 */

import type {
  World,
  WorldObject,
  AssemblerObject,
  EnergyObject,
  MaterialObject,
  SimulationEvent,
  Position,
  MaterialType,
} from './types.js';
import type { Recipe } from './types.js';
import type { GameParams } from './params.js';
import { getRecipeById } from './params.js';
import { distance, nextObjectId, findNearbyObjects, replaceObject, addObject, removeObject } from './world.js';

export const ASSEMBLER_OPMEM_SIZE = 5;

// ============================================================
// Create fresh Assembler
// ============================================================
export function createAssembler(
  id: string,
  position: Position,
  recipe: number = 0,
  phase: 'idle' | 'gathering' = 'idle',
): AssemblerObject {
  const isGathering = phase === 'gathering' && recipe > 0;
  return {
    id,
    kind: 'assembler',
    position,
    orientation: 0,
    operationMemory: [
      isGathering ? 1 : 0,  // current_action
      0,                     // action_trigger
      recipe,                // recipe
      isGathering ? 1 : 0,  // assemble_status
      0,                     // assemble_progress
    ],
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
  assemblerId: string,
  params: GameParams,
): { world: World; events: SimulationEvent[] } {
  const asm = world.objects.find(o => o.id === assemblerId) as AssemblerObject | undefined;
  if (!asm) return { world, events: [] };

  const events: SimulationEvent[] = [];
  let currentWorld = world;
  let updatedAsm = asm;

  // Check for trigger (re-trigger handling)
  const trigger = asm.operationMemory[1];
  const recipe = asm.operationMemory[2];

  if (trigger === 1 && recipe > 0) {
    const recipeData = getRecipeById(params, recipe);
    if (recipeData) {
      // Handle re-trigger: eject unneeded materials
      if (updatedAsm.phase !== 'idle') {
        currentWorld = ejectUnneededMaterials(currentWorld, updatedAsm, recipeData);
        updatedAsm = currentWorld.objects.find(o => o.id === assemblerId) as AssemblerObject;
      }
      // Start gathering
      updatedAsm = {
        ...updatedAsm,
        phase: 'gathering',
        recipe,
        gatherProgress: {},
        gatheredEnergy: 0,
        assembleTicksRemaining: 0,
        operationMemory: updateOpMem(updatedAsm.operationMemory, { currentAction: 1, status: 1, progress: 0, recipe }),
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

      // Check if gathering is complete
      if (isGatheringComplete(updatedAsm, recipeData)) {
        updatedAsm = {
          ...updatedAsm,
          phase: 'assembling',
          assembleTicksRemaining: recipeData.assembleTicks,
          operationMemory: updateOpMem(updatedAsm.operationMemory, { status: 2, progress: recipeData.assembleTicks }),
        };
      }
    }
  } else if (updatedAsm.phase === 'assembling') {
    const remaining = updatedAsm.assembleTicksRemaining - 1;
    if (remaining <= 0) {
      // Assembly complete — eject product
      const recipeData = getRecipeById(params, updatedAsm.recipe);
      if (recipeData) {
        const ejectResult = ejectProduct(currentWorld, updatedAsm, recipeData);
        currentWorld = ejectResult.world;
        events.push({ type: 'assembler_completed', id: assemblerId, productId: ejectResult.productId });
      }
      // Reset to idle
      updatedAsm = {
        ...updatedAsm,
        phase: 'idle',
        recipe: 0,
        gatherProgress: {},
        gatheredEnergy: 0,
        assembleTicksRemaining: 0,
        operationMemory: updateOpMem(updatedAsm.operationMemory, { currentAction: 0, status: 0, progress: 0, recipe: 0 }),
      };
    } else {
      updatedAsm = {
        ...updatedAsm,
        assembleTicksRemaining: remaining,
        operationMemory: updateOpMem(updatedAsm.operationMemory, { progress: remaining }),
      };
    }
  }

  currentWorld = replaceObject(currentWorld, updatedAsm);
  return { world: currentWorld, events };
}

// ============================================================
// Gather materials from nearby objects
// ============================================================
function gatherMaterials(
  world: World,
  asm: AssemblerObject,
  recipe: Recipe,
  params: GameParams,
): { world: World; assembler: AssemblerObject } {
  let currentWorld = world;
  let gatherProgress = { ...asm.gatherProgress };
  let gatheredEnergy = asm.gatheredEnergy;
  let absorbed = 0;

  const nearby = findNearbyObjects(world, asm.position, params.proximityRange, asm.id);

  // Absorb materials
  for (const [matType, needed] of Object.entries(recipe.inputs)) {
    const have = gatherProgress[matType] ?? 0;
    if (have >= needed) continue;

    for (const obj of nearby) {
      if (absorbed >= params.absorptionPerTick) break;
      if (obj.kind !== 'material') continue;
      const mat = obj as MaterialObject;
      if (mat.materialType !== matType) continue;

      // Absorb 1 unit
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

  // Absorb energy
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
  // Update asm in world (will be replaced by caller, but we need it for subsequent checks)
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
// Eject product
// ============================================================
function ejectProduct(
  world: World,
  asm: AssemblerObject,
  recipe: Recipe,
): { world: World; productId: string } {
  const { id: productId, world: w } = nextObjectId(world);
  let currentWorld = w;

  // Eject position: assembler's forward direction (orientation=0 → right)
  const ejectDist = 1.0;
  const rad = (asm.orientation * Math.PI) / 180;
  const pos = {
    x: asm.position.x + Math.cos(rad) * ejectDist,
    y: asm.position.y + Math.sin(rad) * ejectDist,
  };

  let product: WorldObject;
  if (recipe.outputKind === 'material') {
    product = {
      id: productId, kind: 'material', position: pos, orientation: 0,
      materialType: recipe.outputMaterialType!,
      amount: 1,
    };
  } else if (recipe.outputKind === 'assembler') {
    product = createAssembler(productId, pos);
  } else {
    // Processor — empty, stopped
    product = createEmptyProcessor(productId, pos);
  }

  currentWorld = addObject(currentWorld, product);
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

  for (const [matType, gathered] of Object.entries(asm.gatherProgress)) {
    const needed = newRecipe.inputs[matType] ?? 0;
    const excess = gathered - needed;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        const { id, world: w } = nextObjectId(currentWorld);
        currentWorld = w;
        const pos = {
          x: asm.position.x + Math.cos(rad) * ejectDist,
          y: asm.position.y + Math.sin(rad) * ejectDist,
        };
        currentWorld = addObject(currentWorld, {
          id, kind: 'material', position: pos, orientation: 0,
          materialType: matType as MaterialType, amount: 1,
        });
      }
    }
  }

  // Eject excess energy
  const excessEnergy = asm.gatheredEnergy - newRecipe.energyCost;
  if (excessEnergy > 0) {
    const { id, world: w } = nextObjectId(currentWorld);
    currentWorld = w;
    const pos = {
      x: asm.position.x + Math.cos(rad) * ejectDist,
      y: asm.position.y + Math.sin(rad) * ejectDist,
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
  updates: { currentAction?: number; status?: number; progress?: number; recipe?: number },
): readonly number[] {
  const m = [...mem];
  if (updates.currentAction !== undefined) m[0] = updates.currentAction;
  if (updates.recipe !== undefined) m[2] = updates.recipe;
  if (updates.status !== undefined) m[3] = updates.status;
  if (updates.progress !== undefined) m[4] = updates.progress;
  return m;
}

function createEmptyProcessor(id: string, position: Position): ProcessorObject {
  // Avoid circular import — inline the creation
  return {
    id, kind: 'processor', position, orientation: 0,
    operationMemory: new Array(37).fill(0),
    running: false,
    memory: new Array(1024).fill(0),
    registers: [0, 0, 0, 0, 0, 0, 0, 0],
    pc: 0,
    localIdTable: new Map(),
    localIdCounter: 1,
    ioRegisters: { opMemTargetId: 0, opMemOffset: 0, pmemTargetId: 0, pmemAddr: 0 },
  };
}

// Re-export ProcessorObject type for inline creation
import type { ProcessorObject } from './types.js';
