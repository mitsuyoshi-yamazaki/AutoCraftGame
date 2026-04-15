import { describe, it, expect } from 'vitest';
import { createAssembler, executeAssemblerTick, ASSEMBLER_OPMEM_SIZE } from '../src/assembler.js';
import { createEmptyWorld, addObject, getObject } from '../src/world.js';
import { DEFAULT_GAME_PARAMS, getRecipeById } from '../src/params.js';
import type {
  EnergyObject,
  MaterialObject,
  AssemblerObject,
  ProcessorObject,
  World,
  ComponentObject,
} from '../src/types.js';
import {
  ASM_OFF_ASSEMBLE_TRIGGER,
  ASM_OFF_RECIPE,
  ASM_OFF_CONNECTION_TARGET_ID,
  ASM_OFF_ASSEMBLE_STATUS,
  ASM_OFF_ASSEMBLE_PROGRESS,
  ASM_OFF_LAST_PRODUCT_ID,
  ASM_OFF_DISCONNECT_TRIGGER,
  ASM_OFF_DISCONNECT_TARGET_ID,
} from '../src/types.js';

// Assembler id used in tests
const ASM_ID = 1;
// Starting id for ad-hoc fixture material/energy objects
const FIXTURE_START_ID = 100;

function setupWorld(): World {
  // nextObjectId starts at 10 so there's plenty of room above fixture ids.
  return { ...createEmptyWorld(100, 100), nextObjectId: 1000 };
}

function addMaterials(
  world: World,
  pos: { x: number; y: number },
  materials: Record<string, number>,
  startId = FIXTURE_START_ID,
): World {
  let w = world;
  let id = startId;
  for (const [type, count] of Object.entries(materials)) {
    for (let i = 0; i < count; i++) {
      w = addObject(w, {
        id: id++, kind: 'material', position: pos, orientation: 0,
        materialType: type as any, amount: 1,
      } as MaterialObject);
    }
  }
  return w;
}

function addEnergy(world: World, pos: { x: number; y: number }, amount: number): World {
  return addObject(world, {
    id: 200, kind: 'energy', position: pos, orientation: 0, amount,
  } as EnergyObject);
}

describe('assembler', () => {
  it('createAssembler creates idle assembler with no recipe', () => {
    const asm = createAssembler(ASM_ID, { x: 10, y: 10 });
    expect(asm.phase).toBe('idle');
    expect(asm.recipe).toBe(0);
    expect(asm.operationMemory).toHaveLength(ASSEMBLER_OPMEM_SIZE);
    expect(asm.groupId).toBeNull();
  });

  it('createAssembler with recipe and gathering phase sets opmem fields', () => {
    const asm = createAssembler(ASM_ID, { x: 10, y: 10 }, 3, 'gathering');
    expect(asm.phase).toBe('gathering');
    expect(asm.recipe).toBe(3);
    expect(asm.operationMemory[ASM_OFF_RECIPE]).toBe(3);
    expect(asm.operationMemory[ASM_OFF_ASSEMBLE_STATUS]).toBe(1); // gathering
  });

  it('idle assembler does nothing without trigger', () => {
    let w = setupWorld();
    const asm = createAssembler(ASM_ID, { x: 10, y: 10 });
    w = addObject(w, asm);

    const result = executeAssemblerTick(w, ASM_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, ASM_ID) as AssemblerObject;
    expect(updated.phase).toBe('idle');
    expect(result.events).toHaveLength(0);
  });

  it('assembler starts gathering when triggered with valid recipe', () => {
    let w = setupWorld();
    const asm = createAssembler(ASM_ID, { x: 10, y: 10 });
    const opMem = [...asm.operationMemory];
    opMem[ASM_OFF_ASSEMBLE_TRIGGER] = 1;
    opMem[ASM_OFF_RECIPE] = 1; // Metal (Ore × 2)
    w = addObject(w, { ...asm, operationMemory: opMem });

    const result = executeAssemblerTick(w, ASM_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, ASM_ID) as AssemblerObject;
    expect(updated.phase).toBe('gathering');
    expect(updated.operationMemory[ASM_OFF_ASSEMBLE_STATUS]).toBe(1);
    // Trigger should be cleared after handling
    expect(updated.operationMemory[ASM_OFF_ASSEMBLE_TRIGGER]).toBe(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('assembler_started');
  });

  it('gathering assembler absorbs nearby materials', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };
    const asm = createAssembler(ASM_ID, pos, 1, 'gathering'); // recipe=1 (Metal: Ore×2)
    w = addObject(w, asm);
    w = addMaterials(w, pos, { Ore: 3 });
    w = addEnergy(w, pos, 100);

    const result = executeAssemblerTick(w, ASM_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, ASM_ID) as AssemblerObject;

    const totalGathered =
      Object.values(updated.gatherProgress).reduce((a, b) => a + b, 0) + updated.gatheredEnergy;
    expect(totalGathered).toBeGreaterThan(0);
  });

  it('assembler transitions to assembling when all materials gathered', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };
    const params = { ...DEFAULT_GAME_PARAMS, absorptionPerTick: 100 };
    const recipe = getRecipeById(params, 1)!; // Metal: Ore×2, energy=20

    const asm = createAssembler(ASM_ID, pos, 1, 'gathering');
    w = addObject(w, asm);
    w = addMaterials(w, pos, { Ore: 2 });
    w = addEnergy(w, pos, 20);

    const result = executeAssemblerTick(w, ASM_ID, params);
    const updated = getObject(result.world, ASM_ID) as AssemblerObject;
    expect(updated.phase).toBe('assembling');
    expect(updated.assembleTicksRemaining).toBe(recipe.assembleTicks);
    expect(updated.operationMemory[ASM_OFF_ASSEMBLE_STATUS]).toBe(2);
  });

  it('assembling completes and ejects product', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };
    const params = { ...DEFAULT_GAME_PARAMS };
    const recipe = getRecipeById(params, 1)!;

    // opmem: [trigger=0, recipe=1, conn=0, status=2 (assembling), progress=1, last=0, dtrig=0, dtid=0]
    const asm: AssemblerObject = {
      ...createAssembler(ASM_ID, pos, 1, 'gathering'),
      phase: 'assembling',
      gatherProgress: { Ore: 2 },
      gatheredEnergy: recipe.energyCost,
      assembleTicksRemaining: 1,
      operationMemory: [0, 1, 0, 2, 1, 0, 0, 0],
    };
    w = addObject(w, asm);

    const result = executeAssemblerTick(w, ASM_ID, params);
    const updated = getObject(result.world, ASM_ID) as AssemblerObject;
    expect(updated.phase).toBe('idle');
    expect(updated.operationMemory[ASM_OFF_ASSEMBLE_STATUS]).toBe(0);

    // Product should have been created
    const product = result.world.objects.find(o => o.id !== ASM_ID && o.kind === 'material');
    expect(product).toBeDefined();
    expect(result.events.some(e => e.type === 'assembler_completed')).toBe(true);
    // last_product_id opmem field is set
    expect(updated.operationMemory[ASM_OFF_LAST_PRODUCT_ID]).toBeGreaterThan(0);
  });

  it('assembler can produce another assembler', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };
    const params = { ...DEFAULT_GAME_PARAMS };
    const recipe = getRecipeById(params, 3)!; // Assembler: Metal×2 + Circuit×1

    const asm: AssemblerObject = {
      ...createAssembler(ASM_ID, pos, 3, 'gathering'),
      phase: 'assembling',
      gatherProgress: { Metal: 2, Circuit: 1 },
      gatheredEnergy: recipe.energyCost,
      assembleTicksRemaining: 1,
      operationMemory: [0, 3, 0, 2, 1, 0, 0, 0],
    };
    w = addObject(w, asm);

    const result = executeAssemblerTick(w, ASM_ID, params);
    const product = result.world.objects.find(o => o.id !== ASM_ID && o.kind === 'assembler');
    expect(product).toBeDefined();
    expect((product as AssemblerObject).recipe).toBe(0); // empty
  });

  it('assembler can produce a processor', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };
    const params = { ...DEFAULT_GAME_PARAMS };
    const recipe = getRecipeById(params, 4)!; // Processor: Circuit×3

    const asm: AssemblerObject = {
      ...createAssembler(ASM_ID, pos, 4, 'gathering'),
      phase: 'assembling',
      gatherProgress: { Circuit: 3 },
      gatheredEnergy: recipe.energyCost,
      assembleTicksRemaining: 1,
      operationMemory: [0, 4, 0, 2, 1, 0, 0, 0],
    };
    w = addObject(w, asm);

    const result = executeAssemblerTick(w, ASM_ID, params);
    const product = result.world.objects.find(o => o.kind === 'processor');
    expect(product).toBeDefined();
  });

  it('ASSEMBLE with connection_target_id joins the product into a group with the target', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };
    const params = { ...DEFAULT_GAME_PARAMS };
    const recipe = getRecipeById(params, 4)!; // Processor product

    // Seed a peer processor for the assembler to connect the product to.
    const PEER_ID = 2;
    w = addObject(w, {
      id: PEER_ID, kind: 'processor', position: pos, orientation: 0,
      groupId: null, operationMemory: new Array(73).fill(0),
      running: false, memory: new Array(1024).fill(0),
      registers: [0, 0, 0, 0, 0, 0, 0, 0], pc: 0,
      localIdTable: new Map(), localIdCounter: 1,
      ioRegisters: { opMemTargetId: 0, opMemOffset: 0, pmemTargetId: 0, pmemAddr: 0 },
    } as ProcessorObject);

    // opmem: trigger=0, recipe=4, conn_target=PEER_ID, status=2 (assembling), progress=1
    const asm: AssemblerObject = {
      ...createAssembler(ASM_ID, pos, 4, 'gathering'),
      phase: 'assembling',
      gatherProgress: { Circuit: 3 },
      gatheredEnergy: recipe.energyCost,
      assembleTicksRemaining: 1,
      operationMemory: [0, 4, PEER_ID, 2, 1, 0, 0, 0],
    };
    w = addObject(w, asm);

    const result = executeAssemblerTick(w, ASM_ID, params);

    // The newly created processor should share a group with the peer
    const peerAfter = getObject(result.world, PEER_ID) as ComponentObject;
    expect(peerAfter.groupId).not.toBeNull();

    const product = result.world.objects.find(
      o => o.kind === 'processor' && o.id !== PEER_ID,
    ) as ComponentObject | undefined;
    expect(product).toBeDefined();
    expect(product!.groupId).toBe(peerAfter.groupId);
  });
});
