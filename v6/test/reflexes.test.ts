import { describe, it, expect } from 'vitest';
import { createReflexEngine } from '../src/reflexes.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createRng, createWorld, addCharacter } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { buildGrid } from '../src/spatial-grid.js';
import type { Character, Inventory, ComponentType, EnergyNode, World } from '../src/types.js';
import type { ActionReservation } from '../src/io.js';

const engine = createEngine(DEFAULT_GAME_PARAMS);
const reflexEngine = createReflexEngine(DEFAULT_GAME_PARAMS);

function setupWorld() {
  const rng = createRng(42);
  return createWorld(DEFAULT_WORLD_CONFIG, rng, engine.worldEngine);
}

function withEnergyNode(world: World, x: number, y: number): World {
  const node: EnergyNode = {
    id: `en-test-${x}-${y}`,
    position: { x, y },
    productionRate: 100,
    stored: 100,
    maxStored: 100,
    createdAt: 0,
  };
  return { ...world, energyNodes: [...world.energyNodes, node] };
}

function makeChar(opts: {
  energy?: number;
  durability?: number;
  inventory?: Inventory;
  components?: readonly ComponentType[];
  position?: { x: number; y: number };
} = {}): Character {
  const components: readonly ComponentType[] = opts.components ?? [
    'Frame', 'Frame', 'Actuator', 'Harvester', 'Charger',
    'Assembler', 'Processor', 'Sensor', 'MemoryCore', 'MemoryCore',
  ];
  const char = engine.createCharacter(
    'test-char',
    opts.position ?? { x: 10, y: 10 },
    components,
    [],
    opts.energy ?? 1000,
    'Test',
    0,
  );
  return {
    ...char,
    durability: opts.durability ?? char.durability,
    inventory: opts.inventory ?? char.inventory,
  };
}

describe('reflexes: auto-recharge', () => {
  it('fires when energy is low and EnergyNode is in range', () => {
    let world = setupWorld();
    const char = makeChar({ energy: 100 });  // < 200 threshold
    world = addCharacter(world, char);
    world = withEnergyNode(world, 10.5, 10.5);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const result = reflexEngine.injectReflexes(char, world, [], grid);
    expect(result.fired).toBe(true);
    expect(result.reservations.length).toBe(1);
    expect(result.reservations[0].op).toBe('RECHARGE');
  });

  it('does not fire if energy is sufficient', () => {
    let world = setupWorld();
    const char = makeChar({ energy: 500 });  // > 200 threshold
    world = addCharacter(world, char);
    world = withEnergyNode(world, 10.5, 10.5);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const result = reflexEngine.injectReflexes(char, world, [], grid);
    expect(result.fired).toBe(false);
    expect(result.reservations.length).toBe(0);
  });

  it('does not fire if no EnergyNode in range', () => {
    let world = setupWorld();
    const char = makeChar({ energy: 100 });
    world = addCharacter(world, char);
    // Place node far away (out of interactRange)
    world = withEnergyNode(world, 50, 50);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const result = reflexEngine.injectReflexes(char, world, [], grid);
    expect(result.fired).toBe(false);
  });

  it('does not fire if program already issued RECHARGE', () => {
    let world = setupWorld();
    const char = makeChar({ energy: 100 });
    world = addCharacter(world, char);
    world = withEnergyNode(world, 10.5, 10.5);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const existing: ActionReservation[] = [{ op: 'RECHARGE', slotIndex: 0, targetLocalId: 0 }];
    const result = reflexEngine.injectReflexes(char, world, existing, grid);
    expect(result.fired).toBe(false);
    expect(result.reservations.length).toBe(1);  // unchanged
  });

  it('does not fire without Charger component', () => {
    let world = setupWorld();
    const char = makeChar({
      energy: 100,
      components: ['Frame', 'Frame', 'Sensor', 'MemoryCore'],  // no Charger
    });
    world = addCharacter(world, char);
    world = withEnergyNode(world, 10.5, 10.5);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const result = reflexEngine.injectReflexes(char, world, [], grid);
    expect(result.fired).toBe(false);
  });
});

describe('reflexes: auto-repair', () => {
  it('fires when durability is low and Frame is in inventory', () => {
    let world = setupWorld();
    const char = makeChar({
      durability: 100,  // < 300 threshold
      inventory: { Frame: 2 },
    });
    world = addCharacter(world, char);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const result = reflexEngine.injectReflexes(char, world, [], grid);
    expect(result.fired).toBe(true);
    expect(result.reservations.some((r) => r.op === 'REPAIR')).toBe(true);
  });

  it('does not fire if durability is sufficient', () => {
    let world = setupWorld();
    const char = makeChar({
      durability: 500,  // > 300 threshold
      inventory: { Frame: 2 },
    });
    world = addCharacter(world, char);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const result = reflexEngine.injectReflexes(char, world, [], grid);
    expect(result.fired).toBe(false);
  });

  it('does not fire without Frame in inventory', () => {
    let world = setupWorld();
    const char = makeChar({
      durability: 100,
      inventory: {},
    });
    world = addCharacter(world, char);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const result = reflexEngine.injectReflexes(char, world, [], grid);
    expect(result.fired).toBe(false);
  });

  it('does not fire without Assembler component', () => {
    let world = setupWorld();
    const char = makeChar({
      durability: 100,
      inventory: { Frame: 2 },
      components: ['Frame', 'Frame', 'Sensor', 'MemoryCore'],  // no Assembler
    });
    world = addCharacter(world, char);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const result = reflexEngine.injectReflexes(char, world, [], grid);
    expect(result.fired).toBe(false);
  });

  it('does not fire if program already issued REPAIR', () => {
    let world = setupWorld();
    const char = makeChar({
      durability: 100,
      inventory: { Frame: 2 },
    });
    world = addCharacter(world, char);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const existing: ActionReservation[] = [{ op: 'REPAIR', slotIndex: 0 }];
    const result = reflexEngine.injectReflexes(char, world, existing, grid);
    expect(result.fired).toBe(false);
  });
});

describe('reflexes: combined', () => {
  it('both reflexes can fire in the same tick', () => {
    let world = setupWorld();
    const char = makeChar({
      energy: 100,
      durability: 100,
      inventory: { Frame: 2 },
    });
    world = addCharacter(world, char);
    world = withEnergyNode(world, 10.5, 10.5);
    const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);

    const result = reflexEngine.injectReflexes(char, world, [], grid);
    expect(result.fired).toBe(true);
    expect(result.reservations.some((r) => r.op === 'RECHARGE')).toBe(true);
    expect(result.reservations.some((r) => r.op === 'REPAIR')).toBe(true);
  });
});
