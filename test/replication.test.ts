import { describe, it, expect } from 'vitest';
import { executeAction } from '../src/program.js';
import { createCharacter, createInactiveCharacter } from '../src/character.js';
import { createWorld, addCharacter, nextCharacterId, getCharacter, createRng } from '../src/world.js';
import { MIN_COMPONENTS } from '../src/recipes.js';
import {
  deepCopyProgram,
  programsAreEqual,
  evolveProgram,
  getAssemblyComponents,
} from '../src/replication.js';
import type { ComponentType, Program } from '../src/types.js';

const REPLICATOR_PROGRAM: Program = {
  rules: [
    {
      condition: { op: 'inventory_has', item: 'Frame', count: 1 },
      action: {
        op: 'ASSEMBLE',
        components: [...MIN_COMPONENTS],
      },
    },
    { condition: { op: 'true' }, action: { op: 'HARVEST' } },
  ],
};

function setupWorld() {
  let world = createWorld(20, 20, createRng(1));
  const { id, world: w2 } = nextCharacterId(world);
  world = w2;
  const char = createCharacter(id, { x: 5, y: 5 }, MIN_COMPONENTS, REPLICATOR_PROGRAM);
  world = addCharacter(world, char);
  return { world, parentId: id };
}

describe('検証事項1: Programの組立指示でBody構成を自由に決定できる', () => {
  it('ASSEMBLE creates inactive character with specified components', () => {
    const { world, parentId } = setupWorld();

    // Give parent all components needed for assembly
    const componentsToAssemble: ComponentType[] = ['Frame', 'Processor', 'MemoryCore'];
    const parent = getCharacter(world, parentId)!;
    const inventory: Record<string, number> = {};
    for (const c of componentsToAssemble) {
      inventory[c] = (inventory[c] ?? 0) + 1;
    }
    const parentWithParts = { ...parent, inventory };
    const w = { ...world, characters: world.characters.map((c) => (c.id === parentId ? parentWithParts : c)) };

    const result = executeAction(w, parentId, { op: 'ASSEMBLE', components: componentsToAssemble });
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('character_spawned');

    const childId = (result.events[0] as any).childId;
    const child = getCharacter(result.world, childId)!;
    expect(child.components).toEqual(componentsToAssemble);
    expect(child.program).toBeNull(); // inactive until WRITE + ACTIVATE
  });

  it('different ASSEMBLE instructions produce different body configurations', () => {
    const { world, parentId } = setupWorld();
    const parent = getCharacter(world, parentId)!;

    // Config A: minimal
    const configA: ComponentType[] = ['Frame', 'Processor', 'MemoryCore'];
    const invA: Record<string, number> = {};
    for (const c of configA) invA[c] = (invA[c] ?? 0) + 1;

    const parentA = { ...parent, inventory: invA };
    const wA = { ...world, characters: world.characters.map((c) => (c.id === parentId ? parentA : c)) };
    const resultA = executeAction(wA, parentId, { op: 'ASSEMBLE', components: configA });
    const childA = getCharacter(resultA.world, (resultA.events[0] as any).childId)!;

    // Config B: full
    const configB: ComponentType[] = [...MIN_COMPONENTS];
    const invB: Record<string, number> = {};
    for (const c of configB) invB[c] = (invB[c] ?? 0) + 1;

    const parentB = { ...parent, inventory: invB };
    const wB = { ...world, characters: world.characters.map((c) => (c.id === parentId ? parentB : c)) };
    const resultB = executeAction(wB, parentId, { op: 'ASSEMBLE', components: configB });
    const childB = getCharacter(resultB.world, (resultB.events[0] as any).childId)!;

    expect(childA.components).toEqual(configA);
    expect(childB.components).toEqual(configB);
    expect(childA.components).not.toEqual(childB.components);
  });
});

describe('検証事項2: MemoryCoreのデータコピーでProgramが正しく伝達される', () => {
  it('WRITE copies program to inactive character MemoryCore', () => {
    const { world, parentId } = setupWorld();
    const parent = getCharacter(world, parentId)!;

    // Create an inactive child with MemoryCore
    const { id: childId, world: w2 } = nextCharacterId(world);
    const child = createInactiveCharacter(childId, { x: 5, y: 6 }, MIN_COMPONENTS);
    const w3 = addCharacter(w2, child);

    // WRITE parent's program to child
    const result = executeAction(w3, parentId, { op: 'WRITE', target: childId });
    expect(result.success).toBe(true);

    const updatedChild = getCharacter(result.world, childId)!;
    expect(updatedChild.program).not.toBeNull();
    expect(programsAreEqual(parent.program!, updatedChild.program!)).toBe(true);
  });

  it('WRITE creates a deep copy (modifying parent does not affect child)', () => {
    const { world, parentId } = setupWorld();

    // Create child
    const { id: childId, world: w2 } = nextCharacterId(world);
    const child = createInactiveCharacter(childId, { x: 5, y: 6 }, MIN_COMPONENTS);
    const w3 = addCharacter(w2, child);

    // WRITE
    const result = executeAction(w3, parentId, { op: 'WRITE', target: childId });
    const updatedChild = getCharacter(result.world, childId)!;
    const parentProgram = getCharacter(result.world, parentId)!.program!;

    // Verify deep copy — they are equal but not the same reference
    expect(programsAreEqual(parentProgram, updatedChild.program!)).toBe(true);
    expect(parentProgram).not.toBe(updatedChild.program);
  });

  it('ACTIVATE makes the child active after WRITE', () => {
    const { world, parentId } = setupWorld();

    const { id: childId, world: w2 } = nextCharacterId(world);
    const child = createInactiveCharacter(childId, { x: 5, y: 6 }, MIN_COMPONENTS);
    let w3 = addCharacter(w2, child);

    // WRITE then ACTIVATE
    const writeResult = executeAction(w3, parentId, { op: 'WRITE', target: childId });
    const activateResult = executeAction(writeResult.world, parentId, { op: 'ACTIVATE', target: childId });
    expect(activateResult.success).toBe(true);

    const activatedChild = getCharacter(activateResult.world, childId)!;
    expect(activatedChild.program).not.toBeNull();
  });
});

describe('検証事項3: Program内の組立指示の変更で進化が実現できる', () => {
  it('evolveProgram changes ASSEMBLE component list', () => {
    const evolved = evolveProgram(REPLICATOR_PROGRAM, ['Frame', 'Processor', 'MemoryCore']);
    const assemblyComponents = getAssemblyComponents(evolved);
    expect(assemblyComponents).toEqual(['Frame', 'Processor', 'MemoryCore']);
    expect(assemblyComponents).not.toEqual(getAssemblyComponents(REPLICATOR_PROGRAM));
  });

  it('parent with modified program produces daughter with different body', () => {
    const { world, parentId } = setupWorld();
    const parent = getCharacter(world, parentId)!;

    // Original: assemble MIN_COMPONENTS
    const originalComponents = getAssemblyComponents(parent.program!)!;
    expect(originalComponents).toEqual(MIN_COMPONENTS);

    // Evolve: lighter daughter (no Harvester, no Sensor)
    const evolvedComponents: ComponentType[] = ['Frame', 'Actuator', 'Processor', 'Assembler', 'MemoryCore'];
    const evolvedProgram = evolveProgram(parent.program!, evolvedComponents);

    // Give parent evolved program and components for assembly
    const inv: Record<string, number> = {};
    for (const c of evolvedComponents) inv[c] = (inv[c] ?? 0) + 1;
    const evolvedParent = { ...parent, program: evolvedProgram, inventory: inv };
    const w = { ...world, characters: world.characters.map((c) => (c.id === parentId ? evolvedParent : c)) };

    // ASSEMBLE with the evolved component list
    const result = executeAction(w, parentId, { op: 'ASSEMBLE', components: evolvedComponents });
    expect(result.success).toBe(true);

    const childId = (result.events[0] as any).childId;
    const child = getCharacter(result.world, childId)!;

    // Daughter has different body from what the original program would have produced
    expect(child.components).toEqual(evolvedComponents);
    expect(child.components).not.toEqual(MIN_COMPONENTS);
  });

  it('WRITE transmits the evolved program to daughter', () => {
    const parent_program = REPLICATOR_PROGRAM;
    const evolvedComponents: ComponentType[] = ['Frame', 'Actuator', 'Processor', 'Assembler', 'MemoryCore'];
    const evolvedProgram = evolveProgram(parent_program, evolvedComponents);

    // Setup world with evolved parent
    let world = createWorld(20, 20, createRng(1));
    const { id: parentId, world: w2 } = nextCharacterId(world);
    world = w2;
    const parent = createCharacter(parentId, { x: 5, y: 5 }, MIN_COMPONENTS, evolvedProgram);
    world = addCharacter(world, parent);

    // Create inactive child
    const { id: childId, world: w3 } = nextCharacterId(world);
    world = w3;
    const child = createInactiveCharacter(childId, { x: 5, y: 6 }, evolvedComponents);
    world = addCharacter(world, child);

    // WRITE evolved program
    const result = executeAction(world, parentId, { op: 'WRITE', target: childId });
    const updatedChild = getCharacter(result.world, childId)!;

    // Child's program has the evolved assembly instruction
    const childAssembly = getAssemblyComponents(updatedChild.program!);
    expect(childAssembly).toEqual(evolvedComponents);
    expect(childAssembly).not.toEqual(MIN_COMPONENTS);
  });
});
