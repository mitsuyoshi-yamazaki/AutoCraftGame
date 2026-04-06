import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/engine.js';
import type { Engine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { ComponentType, World } from '../src/types.js';
import { encodeW, encodeR, encodeHalt, Opcode } from '../src/vm/vm.js';
import { createGroundGrid } from '../src/ground.js';

// ============================================================
// Setup
// ============================================================

const params = DEFAULT_GAME_PARAMS;
const engine = createEngine(params);

const BASE_COMPONENTS: readonly ComponentType[] = [
  'Frame', 'Actuator', 'Sensor', 'Processor',
  'Harvester', 'Assembler', 'Charger', 'MemoryCore',
];

function makeWorld(overrides?: Partial<World>): World {
  const base: World = {
    width: 60,
    height: 60,
    resourceNodes: [],
    energyNodes: [],
    remains: [],
    characters: [],
    groundGrid: createGroundGrid(60, 60),
    nextCharacterId: 10,
    nextObjectId: 10,
    tick: 0,
  };
  return { ...base, ...overrides };
}

// ============================================================
// I/O address constants
// ============================================================
const BASE_ACTUATOR = 0x1000;

// ============================================================
// Tests: basic tick execution with HALT program
// ============================================================

describe('executeTick — HALT program', () => {
  it('completes a tick with a character running HALT', () => {
    const program = [encodeHalt()];
    const ch = engine.createCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, program, 5000, 'testSpecies', 0,
    );
    const world = makeWorld({ characters: [ch] });

    const result = engine.executeTick(world);

    // Tick should increment
    expect(result.world.tick).toBe(1);

    // Character should still exist (has enough energy and durability)
    const updated = result.world.characters.find(c => c.id === 'c-001');
    expect(updated).toBeDefined();

    // No spawned/died events expected
    const spawnEvents = result.events.filter(e => e.type === 'character_spawned');
    const deathEvents = result.events.filter(e => e.type === 'character_died');
    expect(spawnEvents).toHaveLength(0);
    expect(deathEvents).toHaveLength(0);
  });

  it('inactive character does not execute VM', () => {
    const ch = engine.createInactiveCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, 5000, 'testSpecies', 0,
    );
    const world = makeWorld({ characters: [ch] });

    const result = engine.executeTick(world);

    expect(result.world.tick).toBe(1);
    // No actions should be recorded for inactive character
    expect(result.actions.has('c-001')).toBe(false);
  });

  it('energy is consumed by basal metabolism each tick', () => {
    const program = [encodeHalt()];
    const ch = engine.createCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, program, 5000, 'testSpecies', 0,
    );
    const world = makeWorld({ characters: [ch] });

    const result = engine.executeTick(world);
    const updated = result.world.characters.find(c => c.id === 'c-001')!;
    expect(updated.energy).toBeLessThan(5000);
  });

  it('durability decays each tick', () => {
    const program = [encodeHalt()];
    const ch = engine.createCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, program, 5000, 'testSpecies', 0,
    );
    const world = makeWorld({ characters: [ch] });

    const result = engine.executeTick(world);
    const updated = result.world.characters.find(c => c.id === 'c-001')!;
    expect(updated.durability).toBe(ch.durability - params.durabilityDecayNormal);
  });
});

// ============================================================
// Tests: MOVE via VM program
// ============================================================

describe('executeTick — MOVE program', () => {
  it('character position changes after MOVE + physics', () => {
    // Build a program that:
    // 1. LI r1, 0   (direction = 0 degrees, east)
    // 2. LI r2, BASE_ACTUATOR + 2  (direction I/O address)
    // 3. OUT r2, r1  (write direction 0 to actuator slot 0 offset 2)
    // 4. LI r1, 1   (command = 1)
    // 5. LI r2, BASE_ACTUATOR + 1  (command I/O address)
    // 6. OUT r2, r1  (write command to trigger MOVE)
    // 7. HALT

    const program: number[] = [
      ...encodeW(Opcode.LI, 1, 0, 0),                   // r1 = 0 (direction)
      ...encodeW(Opcode.LI, 2, 0, BASE_ACTUATOR + 2),   // r2 = actuator direction addr
      encodeR(Opcode.OUT, 0, 2, 1),                      // OUT r2, r1
      ...encodeW(Opcode.LI, 1, 0, 1),                    // r1 = 1 (command)
      ...encodeW(Opcode.LI, 2, 0, BASE_ACTUATOR + 1),   // r2 = actuator command addr
      encodeR(Opcode.OUT, 0, 2, 1),                      // OUT r2, r1
      encodeHalt(),
    ];

    const ch = engine.createCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, program, 5000, 'testSpecies', 0,
    );
    const world = makeWorld({ characters: [ch] });

    const result = engine.executeTick(world);
    const updated = result.world.characters.find(c => c.id === 'c-001')!;

    // After MOVE east, physics integration should have changed position
    // The character should have moved in the positive x direction
    expect(updated.position.x).toBeGreaterThan(30);
    // y should remain approximately the same
    expect(updated.position.y).toBeCloseTo(30, 1);

    // Velocity should be positive in x direction
    expect(updated.velocity.vx).toBeGreaterThan(0);
  });

  it('MOVE action is recorded', () => {
    const program: number[] = [
      ...encodeW(Opcode.LI, 1, 0, 0),
      ...encodeW(Opcode.LI, 2, 0, BASE_ACTUATOR + 2),
      encodeR(Opcode.OUT, 0, 2, 1),
      ...encodeW(Opcode.LI, 1, 0, 1),
      ...encodeW(Opcode.LI, 2, 0, BASE_ACTUATOR + 1),
      encodeR(Opcode.OUT, 0, 2, 1),
      encodeHalt(),
    ];

    const ch = engine.createCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, program, 5000, 'testSpecies', 0,
    );
    const world = makeWorld({ characters: [ch] });

    const result = engine.executeTick(world);
    const actions = result.actions.get('c-001');
    expect(actions).toBeDefined();
    expect(actions!.some(a => a.op === 'MOVE' && a.success === true)).toBe(true);
  });
});

// ============================================================
// Tests: runSimulation
// ============================================================

describe('runSimulation', () => {
  it('runs multiple ticks', () => {
    const program = [encodeHalt()];
    const ch = engine.createCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, program, 5000, 'testSpecies', 0,
    );
    const world = makeWorld({ characters: [ch] });

    const { world: finalWorld } = engine.runSimulation(world, 5);
    expect(finalWorld.tick).toBe(5);
  });

  it('stops early when all characters die', () => {
    const program = [encodeHalt()];
    const ch = engine.createCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, program, 1, 'testSpecies', 0,
    );
    // durability=1 so character will die after durability decay
    const chLowDurability = { ...ch, durability: 1 };
    const world = makeWorld({ characters: [chLowDurability] });

    const { world: finalWorld, allEvents } = engine.runSimulation(world, 100);

    // Should stop well before 100 ticks
    expect(finalWorld.tick).toBeLessThan(100);
    expect(finalWorld.characters).toHaveLength(0);
    expect(allEvents.some(e => e.type === 'character_died')).toBe(true);
  });
});

// ============================================================
// Tests: energy node production
// ============================================================

describe('executeTick — energy production', () => {
  it('energy nodes produce energy each tick', () => {
    const program = [encodeHalt()];
    const ch = engine.createCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, program, 5000, 'testSpecies', 0,
    );
    const world = makeWorld({
      characters: [ch],
      energyNodes: [{
        id: 'en-001',
        position: { x: 50, y: 50 },
        productionRate: 100,
        stored: 200,
        maxStored: 1000,
        createdAt: 0,
      }],
    });

    const result = engine.executeTick(world);
    const node = result.world.energyNodes.find(n => n.id === 'en-001')!;
    expect(node.stored).toBe(300); // 200 + 100
  });

  it('energy node stored is capped at maxStored', () => {
    const program = [encodeHalt()];
    const ch = engine.createCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, program, 5000, 'testSpecies', 0,
    );
    const world = makeWorld({
      characters: [ch],
      energyNodes: [{
        id: 'en-001',
        position: { x: 50, y: 50 },
        productionRate: 100,
        stored: 950,
        maxStored: 1000,
        createdAt: 0,
      }],
    });

    const result = engine.executeTick(world);
    const node = result.world.energyNodes.find(n => n.id === 'en-001')!;
    expect(node.stored).toBe(1000); // capped
  });
});

// ============================================================
// Tests: character death and remains
// ============================================================

describe('executeTick — death and remains', () => {
  it('character with 0 durability dies and creates remains', () => {
    const program = [encodeHalt()];
    const ch = engine.createCharacter(
      'c-001', { x: 30, y: 30 }, BASE_COMPONENTS, program, 5000, 'testSpecies', 0,
    );
    // Set durability to 1 so it drops to 0 after decay
    const chLow = { ...ch, durability: 1 };
    const world = makeWorld({ characters: [chLow] });

    const result = engine.executeTick(world);

    expect(result.world.characters.find(c => c.id === 'c-001')).toBeUndefined();
    expect(result.world.remains).toHaveLength(1);
    expect(result.events.some(e => e.type === 'character_died' && e.id === 'c-001')).toBe(true);

    // Remains should contain the character's components
    const remains = result.world.remains[0];
    expect(remains.components).toEqual(BASE_COMPONENTS);
  });
});
