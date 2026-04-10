/**
 * M5 (sexual reproduction / CROSS_WRITE) tests.
 */

import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/engine.js';
import { createActionEngine } from '../src/actions.js';
import { createCharacterEngine } from '../src/character.js';
import { createWorldEngine } from '../src/world.js';
import { createRecipeEngine } from '../src/recipes.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createRng, createWorld, addCharacter } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createForceMap } from '../src/physics.js';
import { buildGrid } from '../src/spatial-grid.js';
import type { ComponentType, Character } from '../src/types.js';
import type { CrossWriteReservation } from '../src/io.js';

describe('cross_write builtin compilation', () => {
  it('compiles to CROSS_WRITE command', async () => {
    const { compile } = await import('../src/vm/compiler.js');
    const result = compile(`
      void main(void) {
        cross_write(1, 2, 0, 0, 100);
        halt();
      }
    `);
    expect(result.errors).toEqual([]);
    const asm = result.assembly!;
    // Look for CROSS_WRITE command (3 written to PRC0_CMD = 0x5001 = 20481)
    expect(asm).toContain('LI r1, 3');
    expect(asm).toContain('20481');  // PRC0_CMD
    // PRC0_PARENT2 = 0x5006 = 20486
    expect(asm).toContain('20486');
  });
});

describe('CROSS_WRITE action', () => {
  function setup(params = DEFAULT_GAME_PARAMS) {
    const recipeEngine = createRecipeEngine(params);
    const worldEngine = createWorldEngine(params);
    const characterEngine = createCharacterEngine(params);
    const actionEngine = createActionEngine(params, {
      recipeEngine, worldEngine, characterEngine,
    });
    return { actionEngine, characterEngine };
  }

  it('mixes parent A and parent B memory in alternating blocks', () => {
    const params = { ...DEFAULT_GAME_PARAMS, crossWriteBlockSize: 4 };
    const { actionEngine, characterEngine } = setup(params);
    const rng = createRng(42);
    let world = createWorld(DEFAULT_WORLD_CONFIG, rng, createWorldEngine(params));
    world = { ...world, resourceNodes: [], energyNodes: [], remains: [] };

    const memSize = 2 * params.memoryCoreWords;
    const parentA = characterEngine.createCharacter(
      'parentA', { x: 10, y: 10 },
      ['Frame', 'Frame', 'Actuator', 'Processor', 'Sensor', 'MemoryCore', 'MemoryCore'],
      new Array(memSize).fill(0xAAAA),
      5000, 'Test', 0,
    );
    const parentB = characterEngine.createCharacter(
      'parentB', { x: 10.5, y: 10 },
      ['Frame', 'Actuator', 'Sensor', 'MemoryCore', 'MemoryCore'],
      new Array(memSize).fill(0xBBBB),
      5000, 'Test', 0,
    );
    const child = characterEngine.createInactiveCharacter(
      'child', { x: 10.3, y: 10 },
      ['Frame', 'MemoryCore', 'MemoryCore'],
      0, 'Test', 0,
    );
    world = addCharacter(world, parentA);
    world = addCharacter(world, parentB);
    world = addCharacter(world, child);

    const localIdTable = new Map<number, string>([
      [1, child.id],
      [2, parentB.id],
    ]);
    const reservations: CrossWriteReservation[] = [{
      op: 'CROSS_WRITE',
      slotIndex: 0,
      targetLocalId: 1,
      parent2LocalId: 2,
      srcAddr: 0,
      dstAddr: 0,
      length: 16,  // 4 blocks of 4 words each
    }];
    const grid = buildGrid(world, params.senseRange);
    const forces = createForceMap();
    const result = actionEngine.executeReservations(
      world, parentA.id, reservations, localIdTable, forces, grid,
    );
    world = result.world;
    expect(result.records[0].success).toBe(true);

    const updatedChild = world.characters.find((c) => c.id === 'child')!;
    // Block 0 (i=0..3): from parent A → 0xAAAA
    expect(updatedChild.vm.memory[0]).toBe(0xAAAA);
    expect(updatedChild.vm.memory[3]).toBe(0xAAAA);
    // Block 1 (i=4..7): from parent B → 0xBBBB
    expect(updatedChild.vm.memory[4]).toBe(0xBBBB);
    expect(updatedChild.vm.memory[7]).toBe(0xBBBB);
    // Block 2 (i=8..11): from parent A
    expect(updatedChild.vm.memory[8]).toBe(0xAAAA);
    expect(updatedChild.vm.memory[11]).toBe(0xAAAA);
    // Block 3 (i=12..15): from parent B
    expect(updatedChild.vm.memory[12]).toBe(0xBBBB);
    expect(updatedChild.vm.memory[15]).toBe(0xBBBB);
    // Beyond length: unchanged (still 0)
    expect(updatedChild.vm.memory[16]).toBe(0);
  });

  it('fails when parent2 is out of range', () => {
    const { actionEngine, characterEngine } = setup();
    const rng = createRng(42);
    let world = createWorld(DEFAULT_WORLD_CONFIG, rng, createWorldEngine(DEFAULT_GAME_PARAMS));
    world = { ...world, resourceNodes: [], energyNodes: [], remains: [] };

    const parentA = characterEngine.createCharacter(
      'parentA', { x: 10, y: 10 },
      ['Frame', 'Processor', 'MemoryCore'],
      [], 5000, 'Test', 0,
    );
    const parentB = characterEngine.createCharacter(
      'parentB', { x: 50, y: 50 },  // far away
      ['Frame', 'MemoryCore'],
      [], 5000, 'Test', 0,
    );
    const child = characterEngine.createInactiveCharacter(
      'child', { x: 10.3, y: 10 },
      ['Frame', 'MemoryCore'], 0, 'Test', 0,
    );
    world = addCharacter(world, parentA);
    world = addCharacter(world, parentB);
    world = addCharacter(world, child);

    const localIdTable = new Map<number, string>([
      [1, child.id],
      [2, parentB.id],
    ]);
    const reservations: CrossWriteReservation[] = [{
      op: 'CROSS_WRITE', slotIndex: 0, targetLocalId: 1, parent2LocalId: 2,
      srcAddr: 0, dstAddr: 0, length: 10,
    }];
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);
    const forces = createForceMap();
    const result = actionEngine.executeReservations(
      world, parentA.id, reservations, localIdTable, forces, grid,
    );
    expect(result.records[0].success).toBe(false);
    expect(result.records[0].reason).toBe('OUT_OF_RANGE');
  });

  it('fails when caller has no Processor', () => {
    const { actionEngine, characterEngine } = setup();
    const rng = createRng(42);
    let world = createWorld(DEFAULT_WORLD_CONFIG, rng, createWorldEngine(DEFAULT_GAME_PARAMS));
    world = { ...world, resourceNodes: [], energyNodes: [], remains: [] };

    const parentA = characterEngine.createCharacter(
      'parentA', { x: 10, y: 10 },
      ['Frame', 'MemoryCore'],  // no Processor
      [], 5000, 'Test', 0,
    );
    const parentB = characterEngine.createCharacter(
      'parentB', { x: 10.5, y: 10 },
      ['Frame', 'MemoryCore'],
      [], 5000, 'Test', 0,
    );
    const child = characterEngine.createInactiveCharacter(
      'child', { x: 10.3, y: 10 },
      ['Frame', 'MemoryCore'], 0, 'Test', 0,
    );
    world = addCharacter(world, parentA);
    world = addCharacter(world, parentB);
    world = addCharacter(world, child);

    const localIdTable = new Map<number, string>([
      [1, child.id],
      [2, parentB.id],
    ]);
    const reservations: CrossWriteReservation[] = [{
      op: 'CROSS_WRITE', slotIndex: 0, targetLocalId: 1, parent2LocalId: 2,
      srcAddr: 0, dstAddr: 0, length: 10,
    }];
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);
    const forces = createForceMap();
    const result = actionEngine.executeReservations(
      world, parentA.id, reservations, localIdTable, forces, grid,
    );
    expect(result.records[0].success).toBe(false);
    expect(result.records[0].reason).toBe('MISSING_COMPONENT');
  });
});
