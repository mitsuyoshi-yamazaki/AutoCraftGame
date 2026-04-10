/**
 * M2 integration test: a character with a "do nothing but halt" program
 * placed adjacent to an EnergyNode should survive significantly longer
 * via the auto-recharge reflex than it would without M2.
 *
 * Why HALT-only program (not all-NOP)?
 *   With M3 (apoptosis), an all-NOP program would hit the instruction limit
 *   every tick and be marked for apoptosis after 30 ticks. We want to test
 *   M2 in isolation: a program that "behaves normally" (HALTs each tick)
 *   but takes no actions, simulating a corrupted program whose action paths
 *   are all destroyed but whose halt is preserved.
 */

import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createRng, createWorld, addCharacter } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import type { ComponentType, EnergyNode } from '../src/types.js';
import { encodeHalt } from '../src/vm/vm.js';

describe('M2 integration: stationary inactive-program character near EnergyNode', () => {
  it('survives many ticks via auto-recharge reflex', () => {
    // M3 must not interfere with this test, so we override the apoptosis
    // limits to be very large.
    const params = {
      ...DEFAULT_GAME_PARAMS,
      apoptosisIdleTickLimit: 100000,
      apoptosisInstrLimitTickLimit: 100000,
    };
    const engine = createEngine(params);
    const rng = createRng(42);
    let world = createWorld(DEFAULT_WORLD_CONFIG, rng, engine.worldEngine);

    // Remove all the random initial nodes/characters from createWorld
    world = {
      ...world,
      resourceNodes: [],
      energyNodes: [],
      remains: [],
    };

    // Create a character with a "halt immediately" program
    const components: readonly ComponentType[] = [
      'Frame', 'Frame', 'Actuator', 'Harvester', 'Charger',
      'Assembler', 'Processor', 'Sensor', 'MemoryCore', 'MemoryCore',
    ];
    const memSize = 2 * params.memoryCoreWords;
    // Program: HALT (1 word). After execution, PC=1 → all zeros from there.
    // But because there's no checkpoint, PC drifts forward. Memory is mostly
    // zeros (= ADD r0, r0, r0 = NOP). The program will eventually hit
    // instruction limit after wrapping around the entire memory. To avoid
    // that, fill the entire memory with HALT instructions.
    const haltProgram = new Array(memSize).fill(encodeHalt());
    const char = engine.createCharacter(
      'broken-1',
      { x: 10, y: 10 },
      [...components],
      haltProgram,
      1000,
      'Broken',
      0,
    );
    world = addCharacter(world, char);

    // Place an EnergyNode right next to the character
    const node: EnergyNode = {
      id: 'en-near',
      position: { x: 10.5, y: 10.5 },
      productionRate: 100,
      stored: 1000,
      maxStored: 1000,
      createdAt: 0,
    };
    world = { ...world, energyNodes: [...world.energyNodes, node] };

    // Run simulation
    let aliveAtTick = 0;
    for (let i = 0; i < 1000; i++) {
      const result = engine.executeTick(world);
      world = result.world;
      if (world.characters.find((c) => c.id === 'broken-1')) {
        aliveAtTick = i + 1;
      } else {
        break;
      }
    }

    // The HALT-only program never takes actions of its own. Without M2,
    // the character would die from starvation around tick 200-250
    // (energy drains, durability decays). With M2, auto-recharge fires
    // when energy < 200, keeping the character alive.
    expect(aliveAtTick).toBeGreaterThan(500);
  });
});
