import { describe, it, expect } from 'vitest';
import { createAssembler, executeAssemblerTick, ASSEMBLER_OPMEM_SIZE } from '../src/assembler.js';
import { createEmptyWorld, addObject } from '../src/world.js';
import { DEFAULT_GAME_PARAMS, getRecipeById } from '../src/params.js';
import type { EnergyObject, MaterialObject, AssemblerObject } from '../src/types.js';

function setupWorld() {
  return createEmptyWorld(100, 100);
}

function addMaterials(world: ReturnType<typeof setupWorld>, pos: { x: number; y: number }, materials: Record<string, number>, startId = 100) {
  let w = world;
  let id = startId;
  for (const [type, count] of Object.entries(materials)) {
    for (let i = 0; i < count; i++) {
      w = addObject(w, {
        id: `mat-${id++}`, kind: 'material', position: pos, orientation: 0,
        materialType: type as any, amount: 1,
      } as MaterialObject);
    }
  }
  return w;
}

function addEnergy(world: ReturnType<typeof setupWorld>, pos: { x: number; y: number }, amount: number) {
  return addObject(world, {
    id: 'energy-1', kind: 'energy', position: pos, orientation: 0, amount,
  } as EnergyObject);
}

describe('assembler', () => {
  it('createAssembler creates idle assembler with no recipe', () => {
    const asm = createAssembler('asm-1', { x: 10, y: 10 });
    expect(asm.phase).toBe('idle');
    expect(asm.recipe).toBe(0);
    expect(asm.operationMemory).toHaveLength(ASSEMBLER_OPMEM_SIZE);
  });

  it('createAssembler with recipe and gathering phase', () => {
    const asm = createAssembler('asm-1', { x: 10, y: 10 }, 3, 'gathering');
    expect(asm.phase).toBe('gathering');
    expect(asm.recipe).toBe(3);
    expect(asm.operationMemory[0]).toBe(1); // current_action = ASSEMBLE
    expect(asm.operationMemory[2]).toBe(3); // recipe
    expect(asm.operationMemory[3]).toBe(1); // status = gathering
  });

  it('idle assembler does nothing without trigger', () => {
    let w = setupWorld();
    const asm = createAssembler('asm-1', { x: 10, y: 10 });
    w = addObject(w, asm);

    const result = executeAssemblerTick(w, 'asm-1', DEFAULT_GAME_PARAMS);
    const updated = result.world.objects.find(o => o.id === 'asm-1') as AssemblerObject;
    expect(updated.phase).toBe('idle');
    expect(result.events).toHaveLength(0);
  });

  it('assembler starts gathering when triggered with valid recipe', () => {
    let w = setupWorld();
    // Create assembler with recipe set and trigger
    const asm = createAssembler('asm-1', { x: 10, y: 10 });
    const opMem = [...asm.operationMemory];
    opMem[1] = 1; // action_trigger
    opMem[2] = 1; // recipe = Metal (Ore × 2)
    w = addObject(w, { ...asm, operationMemory: opMem });

    const result = executeAssemblerTick(w, 'asm-1', DEFAULT_GAME_PARAMS);
    const updated = result.world.objects.find(o => o.id === 'asm-1') as AssemblerObject;
    expect(updated.phase).toBe('gathering');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('assembler_started');
  });

  it('gathering assembler absorbs nearby materials', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };
    const asm = createAssembler('asm-1', pos, 1, 'gathering'); // recipe=1 (Metal: Ore×2)
    w = addObject(w, asm);
    w = addMaterials(w, pos, { Ore: 3 }); // 3 Ore nearby (need 2)
    w = addEnergy(w, pos, 100);

    const result = executeAssemblerTick(w, 'asm-1', DEFAULT_GAME_PARAMS);
    const updated = result.world.objects.find(o => o.id === 'asm-1') as AssemblerObject;

    // With absorptionPerTick=1, should absorb 1 unit this tick
    const totalGathered = Object.values(updated.gatherProgress).reduce((a, b) => a + b, 0) + updated.gatheredEnergy;
    expect(totalGathered).toBeGreaterThan(0);
  });

  it('assembler transitions to assembling when all materials gathered', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };

    // Use high absorption rate to gather everything in one tick
    const params = { ...DEFAULT_GAME_PARAMS, absorptionPerTick: 100 };
    const recipe = getRecipeById(params, 1)!; // Metal: Ore×2, energy=20

    const asm = createAssembler('asm-1', pos, 1, 'gathering');
    w = addObject(w, asm);
    w = addMaterials(w, pos, { Ore: 2 });
    w = addEnergy(w, pos, 20);

    const result = executeAssemblerTick(w, 'asm-1', params);
    const updated = result.world.objects.find(o => o.id === 'asm-1') as AssemblerObject;
    expect(updated.phase).toBe('assembling');
    expect(updated.assembleTicksRemaining).toBe(recipe.assembleTicks);
  });

  it('assembling completes and ejects product', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };
    const params = { ...DEFAULT_GAME_PARAMS };
    const recipe = getRecipeById(params, 1)!;

    // Create assembler already in assembling phase with 1 tick remaining
    const asm: AssemblerObject = {
      ...createAssembler('asm-1', pos, 1, 'gathering'),
      phase: 'assembling',
      gatherProgress: { Ore: 2 },
      gatheredEnergy: recipe.energyCost,
      assembleTicksRemaining: 1,
      operationMemory: [1, 0, 1, 2, 1], // current=ASSEMBLE, status=assembling, progress=1
    };
    w = addObject(w, asm);

    const result = executeAssemblerTick(w, 'asm-1', params);
    const updated = result.world.objects.find(o => o.id === 'asm-1') as AssemblerObject;
    expect(updated.phase).toBe('idle');

    // Product should have been created
    const product = result.world.objects.find(o => o.id !== 'asm-1' && o.kind === 'material');
    expect(product).toBeDefined();
    expect(result.events.some(e => e.type === 'assembler_completed')).toBe(true);
  });

  it('assembler can produce another assembler', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };
    const params = { ...DEFAULT_GAME_PARAMS };
    const recipe = getRecipeById(params, 3)!; // Assembler: Metal×2 + Circuit×1

    const asm: AssemblerObject = {
      ...createAssembler('asm-1', pos, 3, 'gathering'),
      phase: 'assembling',
      gatherProgress: { Metal: 2, Circuit: 1 },
      gatheredEnergy: recipe.energyCost,
      assembleTicksRemaining: 1,
      operationMemory: [1, 0, 3, 2, 1],
    };
    w = addObject(w, asm);

    const result = executeAssemblerTick(w, 'asm-1', params);
    const product = result.world.objects.find(o => o.id !== 'asm-1' && o.kind === 'assembler');
    expect(product).toBeDefined();
    expect((product as AssemblerObject).recipe).toBe(0); // empty
  });

  it('assembler can produce a processor', () => {
    let w = setupWorld();
    const pos = { x: 10, y: 10 };
    const params = { ...DEFAULT_GAME_PARAMS };
    const recipe = getRecipeById(params, 4)!; // Processor: Circuit×3

    const asm: AssemblerObject = {
      ...createAssembler('asm-1', pos, 4, 'gathering'),
      phase: 'assembling',
      gatherProgress: { Circuit: 3 },
      gatheredEnergy: recipe.energyCost,
      assembleTicksRemaining: 1,
      operationMemory: [1, 0, 4, 2, 1],
    };
    w = addObject(w, asm);

    const result = executeAssemblerTick(w, 'asm-1', params);
    const product = result.world.objects.find(o => o.kind === 'processor');
    expect(product).toBeDefined();
  });
});
