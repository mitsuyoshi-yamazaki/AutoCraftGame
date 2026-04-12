import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/simulation/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/simulation/params.js';
import { DEFAULT_WORLD_CONFIG, createRng } from '../src/simulation/world.js';
import { distance } from '../src/simulation/world.js';
import { MIN_COMPONENTS } from '../src/simulation/recipes.js';
import type { Program, ComponentType, Position } from '../src/simulation/types.js';

const SIMPLE_PROGRAM: Program = {
  name: 'test',
  rules: [
    { condition: { op: 'true' }, action: { op: 'MOVE', direction: 0 } },
  ],
};

const HARVEST_PROGRAM: Program = {
  name: 'harvester',
  rules: [
    { condition: { op: 'true' }, action: { op: 'HARVEST' } },
  ],
};

function makeEngine() {
  return createEngine(DEFAULT_GAME_PARAMS);
}

function makeWorld() {
  const engine = makeEngine();
  const rng = createRng(42);
  return { engine, world: engine.createWorld(DEFAULT_WORLD_CONFIG, rng) };
}

function addCharacterToWorld(
  engine: ReturnType<typeof makeEngine>,
  world: ReturnType<typeof makeWorld>['world'],
  pos: Position,
  program: Program,
) {
  const id = `char-${String(world.nextCharacterId).padStart(3, '0')}`;
  world.nextCharacterId++;
  const character = engine.createCharacter(
    id, pos, [...MIN_COMPONENTS], program, 5000, 'Test', 0,
  );
  world.characters.push(character);
  return { world, characterId: id };
}

describe('Simulation Engine', () => {
  it('creates a world with correct dimensions', () => {
    const { world } = makeWorld();
    expect(world.width).toBe(60);
    expect(world.height).toBe(60);
    expect(world.tick).toBe(0);
    expect(world.resourceNodes.length).toBe(160); // 80 ore + 80 crystal
    expect(world.energyNodes.length).toBe(65);
  });

  it('executes a tick and increments tick counter', () => {
    const { engine, world } = makeWorld();
    const result = engine.executeTick(world);
    expect(result.world.tick).toBe(1);
  });

  it('character moves with MOVE action', () => {
    const { engine, world } = makeWorld();
    const pos: Position = { x: 30, y: 30 };
    addCharacterToWorld(engine, world, pos, SIMPLE_PROGRAM);

    const char = world.characters[0];
    const initX = char.position.x;

    engine.executeTick(world);

    // MOVE direction=0 (right) applies force in +x direction
    // After physics integration, character should have moved
    expect(world.characters.length).toBeGreaterThan(0);
    const updated = world.characters.find((c) => c.id === char.id);
    expect(updated).toBeDefined();
    // With MOVE force and friction, position should change
    expect(updated!.velocity.vx).not.toBe(0);
  });

  it('energy decreases from metabolism', () => {
    const { engine, world } = makeWorld();
    addCharacterToWorld(engine, world, { x: 30, y: 30 }, SIMPLE_PROGRAM);

    const initialEnergy = world.characters[0].energy;
    engine.executeTick(world);
    // Energy should decrease (metabolism + action cost)
    expect(world.characters[0].energy).toBeLessThan(initialEnergy);
  });

  it('durability decays each tick', () => {
    const { engine, world } = makeWorld();
    addCharacterToWorld(engine, world, { x: 30, y: 30 }, SIMPLE_PROGRAM);

    const initialDurability = world.characters[0].durability;
    engine.executeTick(world);
    expect(world.characters[0].durability).toBeLessThan(initialDurability);
  });

  it('character dies when durability reaches 0', () => {
    const { engine, world } = makeWorld();
    addCharacterToWorld(engine, world, { x: 30, y: 30 }, SIMPLE_PROGRAM);

    // Set durability to 1 so it dies next tick
    world.characters[0].durability = 1;

    const result = engine.executeTick(world);
    expect(result.events.some((e) => e.type === 'character_died')).toBe(true);
    expect(world.characters.length).toBe(0);
    expect(world.remains.length).toBeGreaterThan(0);
  });

  it('energy nodes produce energy each tick', () => {
    const { engine, world } = makeWorld();
    // Drain some energy from a node
    const node = world.energyNodes[0];
    node.stored = 0;
    const initialStored = node.stored;

    engine.executeTick(world);

    expect(node.stored).toBeGreaterThan(initialStored);
  });

  it('runSimulation runs multiple ticks', () => {
    const { engine, world } = makeWorld();
    addCharacterToWorld(engine, world, { x: 30, y: 30 }, SIMPLE_PROGRAM);

    const { allEvents } = engine.runSimulation(world, 10);
    expect(world.tick).toBe(10);
    expect(Array.isArray(allEvents)).toBe(true);
  });

  it('distance function calculates correctly', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });
});

describe('World Manager Integration', () => {
  it('creates world with initial characters', async () => {
    const { default: selfReplicatorJson } = await import(
      '../../server/programs/self-replicator.json', { with: { type: 'json' } }
    );
    const engine = makeEngine();
    const rng = createRng(42);
    const world = engine.createWorld(DEFAULT_WORLD_CONFIG, rng);

    const { placeInitialCharacters, loadProgramJson } = await import(
      '../src/initial-characters.js'
    );

    const programDef = loadProgramJson(selfReplicatorJson);
    const populated = placeInitialCharacters(world, engine, [programDef], rng);
    expect(populated.characters.length).toBe(3); // default count
    expect(populated.characters[0].species).toBe('Replicator');
  });
});
