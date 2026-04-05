import { describe, it, expect } from 'vitest';
import type { World, Character } from '../src/types.js';
import { createForceMap, addForce, createPhysicsEngine } from '../src/physics.js';
import { createRecipeEngine } from '../src/recipes.js';
import { createWorldEngine } from '../src/world.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { buildGrid } from '../src/spatial-grid.js';
import { createGroundGrid } from '../src/ground.js';

const recipeEngine = createRecipeEngine(DEFAULT_GAME_PARAMS);
const worldEngine = createWorldEngine(DEFAULT_GAME_PARAMS);
const { computeFrictionForces, computeCollisionForces, integratePhysics } = createPhysicsEngine(DEFAULT_GAME_PARAMS, recipeEngine, worldEngine);

function makeChar(id: string, x: number, y: number, vx = 0, vy = 0): Character {
  return {
    id,
    species: 'test',
    position: { x, y },
    velocity: { vx, vy },
    components: ['Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'Charger', 'MemoryCore'],
    inventory: {},
    durability: 300,
    energy: 5000,
    program: null,
    senseData: null,
    registers: [],
  };
}

function makeWorld(chars: Character[]): World {
  return {
    width: 20,
    height: 20,
    resourceNodes: [],
    energyNodes: [],
    remains: [],
    characters: chars,
    groundGrid: createGroundGrid(20, 20),
    nextCharacterId: chars.length + 1,
    nextObjectId: 1,
    tick: 0,
  };
}

describe('physics', () => {
  describe('ForceMap', () => {
    it('accumulates forces', () => {
      const map = createForceMap();
      addForce(map, 'a', { fx: 1, fy: 2 });
      addForce(map, 'a', { fx: 3, fy: -1 });
      const f = map.get('a')!;
      expect(f.fx).toBe(4);
      expect(f.fy).toBe(1);
    });
  });

  describe('friction', () => {
    it('applies friction force opposite to velocity', () => {
      const char = makeChar('c1', 10, 10, 2.0, 0);
      const world = makeWorld([char]);
      const forces = createForceMap();
      computeFrictionForces(world, forces);
      const f = forces.get('c1')!;
      // friction = -vx * FRICTION_COEFFICIENT * mass
      // mass = 40, vx = 2, friction_coeff = 0.8 → fx = -2 * 0.8 * 40 = -64
      expect(f.fx).toBeCloseTo(-2.0 * DEFAULT_GAME_PARAMS.frictionCoefficient * 40);
      expect(f.fy).toBeCloseTo(0);
    });
  });

  describe('collision', () => {
    it('generates repulsion force when characters overlap', () => {
      const c1 = makeChar('c1', 10, 10);
      const c2 = makeChar('c2', 10.5, 10);
      const world = makeWorld([c1, c2]);
      const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);
      const forces = createForceMap();
      computeCollisionForces(world, forces, grid);
      const f1 = forces.get('c1')!;
      const f2 = forces.get('c2')!;
      expect(f1.fx).toBeLessThan(0);
      expect(f2.fx).toBeGreaterThan(0);
      expect(f1.fx).toBeCloseTo(-f2.fx);
    });

    it('generates wall repulsion force', () => {
      const c = makeChar('c1', 0.2, 10);
      const world = makeWorld([c]);
      const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);
      const forces = createForceMap();
      computeCollisionForces(world, forces, grid);
      const f = forces.get('c1')!;
      expect(f.fx).toBeGreaterThan(0);
    });

    it('no force when characters are far apart', () => {
      const c1 = makeChar('c1', 5, 5);
      const c2 = makeChar('c2', 10, 10);
      const world = makeWorld([c1, c2]);
      const grid = buildGrid(world, DEFAULT_GAME_PARAMS.senseRange);
      const forces = createForceMap();
      computeCollisionForces(world, forces, grid);
      expect(forces.has('c1')).toBe(false);
    });
  });

  describe('integration', () => {
    it('updates position from velocity', () => {
      const char = makeChar('c1', 10, 10, 1.0, 0.5);
      const world = makeWorld([char]);
      const forces = createForceMap();
      const updated = integratePhysics(world, forces);
      const c = updated.characters[0];
      expect(c.position.x).toBeCloseTo(11.0);
      expect(c.position.y).toBeCloseTo(10.5);
    });

    it('applies force to change velocity', () => {
      const char = makeChar('c1', 10, 10, 0, 0);
      const world = makeWorld([char]);
      const forces = createForceMap();
      addForce(forces, 'c1', { fx: 40, fy: 0 }); // mass=40, accel=1
      const updated = integratePhysics(world, forces);
      const c = updated.characters[0];
      expect(c.velocity.vx).toBeCloseTo(1.0);
      expect(c.position.x).toBeCloseTo(11.0);
    });

    it('clamps small velocities to zero', () => {
      const tiny = DEFAULT_GAME_PARAMS.velocityClampThreshold / 2;
      const char = makeChar('c1', 10, 10, tiny, 0);
      const world = makeWorld([char]);
      const forces = createForceMap();
      const updated = integratePhysics(world, forces);
      const c = updated.characters[0];
      expect(c.velocity.vx).toBe(0);
      expect(c.velocity.vy).toBe(0);
    });

    it('clamps position to world bounds', () => {
      const char = makeChar('c1', 19.9, 10, 1.0, 0);
      const world = makeWorld([char]);
      const forces = createForceMap();
      const updated = integratePhysics(world, forces);
      const c = updated.characters[0];
      expect(c.position.x).toBeLessThanOrEqual(world.width - DEFAULT_GAME_PARAMS.characterRadius);
    });
  });
});
