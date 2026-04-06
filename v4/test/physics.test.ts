import { describe, it, expect } from 'vitest';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createRecipeEngine } from '../src/recipes.js';
import { createWorldEngine } from '../src/world.js';
import { createPhysicsEngine, createForceMap, addForce } from '../src/physics.js';
import type { World, Character, ComponentType } from '../src/types.js';
import { buildGrid } from '../src/spatial-grid.js';
import { createGroundGrid } from '../src/ground.js';

const params = DEFAULT_GAME_PARAMS;
const recipeEngine = createRecipeEngine(params);
const worldEngine = createWorldEngine(params);
const physics = createPhysicsEngine(params, recipeEngine, worldEngine);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_COMPONENTS: readonly ComponentType[] = [
  'Frame', 'Actuator', 'Sensor', 'Processor',
  'Harvester', 'Assembler', 'Charger', 'MemoryCore',
];

function makeCharacter(overrides: Partial<Character> & { id: string }): Character {
  return {
    species: 'test',
    position: { x: 10, y: 10 },
    velocity: { vx: 0, vy: 0 },
    components: BASE_COMPONENTS,
    inventory: {},
    durability: 300,
    energy: 1000,
    createdAt: 0,
    vm: {
      memory: [],
      registers: [0, 0, 0, 0, 0, 0, 0, 0],
      pc: 0,
      active: true,
      localIdTable: new Map(),
      localIdCounter: 0,
    },
    ...overrides,
  };
}

function makeWorld(characters: Character[], width = 60, height = 60): World {
  return {
    width,
    height,
    resourceNodes: [],
    energyNodes: [],
    remains: [],
    characters,
    groundGrid: createGroundGrid(width, height),
    nextCharacterId: 1,
    nextObjectId: 1,
    tick: 0,
  };
}

// ---------------------------------------------------------------------------
// ForceMap helpers
// ---------------------------------------------------------------------------
describe('ForceMap helpers', () => {
  it('createForceMap returns an empty map', () => {
    const fm = createForceMap();
    expect(fm.size).toBe(0);
  });

  it('addForce accumulates forces for the same id', () => {
    const fm = createForceMap();
    addForce(fm, 'a', { fx: 10, fy: 20 });
    addForce(fm, 'a', { fx: 5, fy: -3 });
    const f = fm.get('a')!;
    expect(f.fx).toBe(15);
    expect(f.fy).toBe(17);
  });

  it('addForce stores separate entries for different ids', () => {
    const fm = createForceMap();
    addForce(fm, 'a', { fx: 1, fy: 2 });
    addForce(fm, 'b', { fx: 3, fy: 4 });
    expect(fm.get('a')).toEqual({ fx: 1, fy: 2 });
    expect(fm.get('b')).toEqual({ fx: 3, fy: 4 });
  });
});

// ---------------------------------------------------------------------------
// computeFrictionForces
// ---------------------------------------------------------------------------
describe('computeFrictionForces', () => {
  it('applies friction opposing velocity', () => {
    const char = makeCharacter({ id: 'c1', velocity: { vx: 5, vy: -3 } });
    const world = makeWorld([char]);
    const forces = createForceMap();

    physics.computeFrictionForces(world, forces);

    const f = forces.get('c1')!;
    const mass = recipeEngine.calculateMass(char.components, char.inventory);
    // friction = -v * coefficient * mass
    expect(f.fx).toBeCloseTo(-5 * params.frictionCoefficient * mass);
    expect(f.fy).toBeCloseTo(3 * params.frictionCoefficient * mass);
  });

  it('produces zero friction for a stationary character', () => {
    const char = makeCharacter({ id: 'c1', velocity: { vx: 0, vy: 0 } });
    const world = makeWorld([char]);
    const forces = createForceMap();

    physics.computeFrictionForces(world, forces);

    const f = forces.get('c1')!;
    expect(f.fx).toBeCloseTo(0);
    expect(f.fy).toBeCloseTo(0);
  });

  it('applies friction to every character in the world', () => {
    const c1 = makeCharacter({ id: 'c1', velocity: { vx: 1, vy: 0 }, position: { x: 5, y: 5 } });
    const c2 = makeCharacter({ id: 'c2', velocity: { vx: 0, vy: 2 }, position: { x: 15, y: 15 } });
    const world = makeWorld([c1, c2]);
    const forces = createForceMap();

    physics.computeFrictionForces(world, forces);

    expect(forces.has('c1')).toBe(true);
    expect(forces.has('c2')).toBe(true);
    // c1 moves in +x, friction should push in -x
    expect(forces.get('c1')!.fx).toBeLessThan(0);
    // c2 moves in +y, friction should push in -y
    expect(forces.get('c2')!.fy).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeCollisionForces
// ---------------------------------------------------------------------------
describe('computeCollisionForces', () => {
  it('generates repulsion when two characters overlap', () => {
    // Place two characters with overlapping radii (radius=0.4, so <0.8 apart)
    const c1 = makeCharacter({ id: 'c1', position: { x: 10, y: 10 } });
    const c2 = makeCharacter({ id: 'c2', position: { x: 10.5, y: 10 } });
    const world = makeWorld([c1, c2]);
    const grid = buildGrid(world, 3);
    const forces = createForceMap();

    physics.computeCollisionForces(world, forces, grid);

    const f1 = forces.get('c1')!;
    const f2 = forces.get('c2')!;
    // c1 should be pushed left (negative x), c2 pushed right (positive x)
    expect(f1.fx).toBeLessThan(0);
    expect(f2.fx).toBeGreaterThan(0);
    // Newton's third law: equal and opposite
    expect(f1.fx).toBeCloseTo(-f2.fx);
    expect(f1.fy).toBeCloseTo(-f2.fy);
  });

  it('generates no force for non-overlapping characters', () => {
    const c1 = makeCharacter({ id: 'c1', position: { x: 5, y: 5 } });
    const c2 = makeCharacter({ id: 'c2', position: { x: 10, y: 10 } });
    const world = makeWorld([c1, c2]);
    const grid = buildGrid(world, 3);
    const forces = createForceMap();

    physics.computeCollisionForces(world, forces, grid);

    // Far apart characters: only wall forces may apply. Check no character-character force
    // Both are far from walls, so forces should be absent or zero
    const f1 = forces.get('c1');
    const f2 = forces.get('c2');
    if (f1) {
      expect(f1.fx).toBeCloseTo(0);
      expect(f1.fy).toBeCloseTo(0);
    }
    if (f2) {
      expect(f2.fx).toBeCloseTo(0);
      expect(f2.fy).toBeCloseTo(0);
    }
  });

  it('generates wall repulsion when a character is near the left wall', () => {
    // Place character very close to the left wall (x < characterRadius)
    const c = makeCharacter({ id: 'c1', position: { x: 0.1, y: 10 } });
    const world = makeWorld([c]);
    const grid = buildGrid(world, 3);
    const forces = createForceMap();

    physics.computeCollisionForces(world, forces, grid);

    const f = forces.get('c1')!;
    // Pushed away from left wall: positive x
    expect(f.fx).toBeGreaterThan(0);
  });

  it('generates wall repulsion when a character is near the bottom wall', () => {
    const c = makeCharacter({ id: 'c1', position: { x: 10, y: 59.9 } });
    const world = makeWorld([c]);
    const grid = buildGrid(world, 3);
    const forces = createForceMap();

    physics.computeCollisionForces(world, forces, grid);

    const f = forces.get('c1')!;
    // Pushed away from bottom wall: negative y
    expect(f.fy).toBeLessThan(0);
  });

  it('generates wall repulsion for top and right walls', () => {
    const cTop = makeCharacter({ id: 'c1', position: { x: 10, y: 0.1 } });
    const cRight = makeCharacter({ id: 'c2', position: { x: 59.9, y: 10 } });
    const world = makeWorld([cTop, cRight]);
    const grid = buildGrid(world, 3);
    const forces = createForceMap();

    physics.computeCollisionForces(world, forces, grid);

    // Top wall: pushed in +y
    expect(forces.get('c1')!.fy).toBeGreaterThan(0);
    // Right wall: pushed in -x
    expect(forces.get('c2')!.fx).toBeLessThan(0);
  });

  it('generates repulsion against a resource node', () => {
    const c = makeCharacter({ id: 'c1', position: { x: 10, y: 10 } });
    const world: World = {
      ...makeWorld([c]),
      resourceNodes: [{
        id: 'rn1',
        position: { x: 10.5, y: 10 },
        type: 'OreNode',
        remaining: 100,
        createdAt: 0,
      }],
    };
    const grid = buildGrid(world, 3);
    const forces = createForceMap();

    physics.computeCollisionForces(world, forces, grid);

    const f = forces.get('c1')!;
    // Character should be pushed away from the resource node (left)
    expect(f.fx).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// integratePhysics
// ---------------------------------------------------------------------------
describe('integratePhysics', () => {
  it('updates position and velocity based on applied force', () => {
    const char = makeCharacter({ id: 'c1', position: { x: 10, y: 10 }, velocity: { vx: 0, vy: 0 } });
    const world = makeWorld([char]);
    const forces = createForceMap();
    const mass = recipeEngine.calculateMass(char.components, char.inventory);
    // Apply a known force
    addForce(forces, 'c1', { fx: mass * 2, fy: mass * 3 });

    const result = physics.integratePhysics(world, forces);
    const updated = result.characters.find(c => c.id === 'c1')!;

    // acceleration = force / mass = 2, 3
    // new velocity = 0 + 2, 0 + 3 = 2, 3
    expect(updated.velocity.vx).toBeCloseTo(2);
    expect(updated.velocity.vy).toBeCloseTo(3);
    // new position = 10 + 2, 10 + 3 = 12, 13
    expect(updated.position.x).toBeCloseTo(12);
    expect(updated.position.y).toBeCloseTo(13);
  });

  it('clamps velocity to zero when below threshold', () => {
    // Give a tiny velocity that after zero force should remain tiny, then get clamped
    const tiny = params.velocityClampThreshold / 10;
    const char = makeCharacter({ id: 'c1', velocity: { vx: tiny, vy: tiny } });
    const world = makeWorld([char]);
    const forces = createForceMap();

    const result = physics.integratePhysics(world, forces);
    const updated = result.characters.find(c => c.id === 'c1')!;

    expect(updated.velocity.vx).toBe(0);
    expect(updated.velocity.vy).toBe(0);
  });

  it('clamps position to world boundaries', () => {
    const char = makeCharacter({
      id: 'c1',
      position: { x: 1, y: 1 },
      velocity: { vx: -10, vy: -10 },
    });
    const world = makeWorld([char], 20, 20);
    const forces = createForceMap();

    const result = physics.integratePhysics(world, forces);
    const updated = result.characters.find(c => c.id === 'c1')!;

    // Position should be clamped to [characterRadius, width - characterRadius]
    expect(updated.position.x).toBeGreaterThanOrEqual(params.characterRadius);
    expect(updated.position.y).toBeGreaterThanOrEqual(params.characterRadius);
  });

  it('clamps position to upper world boundary', () => {
    const char = makeCharacter({
      id: 'c1',
      position: { x: 19, y: 19 },
      velocity: { vx: 10, vy: 10 },
    });
    const world = makeWorld([char], 20, 20);
    const forces = createForceMap();

    const result = physics.integratePhysics(world, forces);
    const updated = result.characters.find(c => c.id === 'c1')!;

    expect(updated.position.x).toBeLessThanOrEqual(20 - params.characterRadius);
    expect(updated.position.y).toBeLessThanOrEqual(20 - params.characterRadius);
  });

  it('applies no acceleration when no force is present', () => {
    const char = makeCharacter({ id: 'c1', velocity: { vx: 2, vy: 3 } });
    const world = makeWorld([char]);
    const forces = createForceMap();
    // No force added for c1

    const result = physics.integratePhysics(world, forces);
    const updated = result.characters.find(c => c.id === 'c1')!;

    // Velocity should stay the same (no force => zero acceleration)
    expect(updated.velocity.vx).toBeCloseTo(2);
    expect(updated.velocity.vy).toBeCloseTo(3);
    // Position moves by velocity
    expect(updated.position.x).toBeCloseTo(10 + 2);
    expect(updated.position.y).toBeCloseTo(10 + 3);
  });

  it('integrates multiple characters independently', () => {
    const c1 = makeCharacter({ id: 'c1', position: { x: 10, y: 10 }, velocity: { vx: 1, vy: 0 } });
    const c2 = makeCharacter({ id: 'c2', position: { x: 20, y: 20 }, velocity: { vx: 0, vy: 1 } });
    const world = makeWorld([c1, c2]);
    const forces = createForceMap();

    const result = physics.integratePhysics(world, forces);
    const u1 = result.characters.find(c => c.id === 'c1')!;
    const u2 = result.characters.find(c => c.id === 'c2')!;

    expect(u1.position.x).toBeCloseTo(11);
    expect(u1.position.y).toBeCloseTo(10);
    expect(u2.position.x).toBeCloseTo(20);
    expect(u2.position.y).toBeCloseTo(21);
  });
});
