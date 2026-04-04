import { describe, it, expect } from 'vitest';
import type { World, Character } from '../src/types.js';
import { createForceMap, addForce, computeFrictionForces, computeCollisionForces, integratePhysics } from '../src/physics.js';
import { FRICTION_COEFFICIENT, COLLISION_STIFFNESS, CHARACTER_RADIUS, VELOCITY_CLAMP_THRESHOLD } from '../src/constants.js';

function makeChar(id: string, x: number, y: number, vx = 0, vy = 0): Character {
  return {
    id,
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
      expect(f.fx).toBeCloseTo(-2.0 * FRICTION_COEFFICIENT * 40);
      expect(f.fy).toBeCloseTo(0);
    });
  });

  describe('collision', () => {
    it('generates repulsion force when characters overlap', () => {
      // Two characters at distance < 2*CHARACTER_RADIUS
      const c1 = makeChar('c1', 10, 10);
      const c2 = makeChar('c2', 10.5, 10); // distance = 0.5, overlap = 0.8 - 0.5 = 0.3
      const world = makeWorld([c1, c2]);
      const forces = createForceMap();
      computeCollisionForces(world, forces);
      const f1 = forces.get('c1')!;
      const f2 = forces.get('c2')!;
      // c1 should be pushed left (negative x), c2 pushed right (positive x)
      expect(f1.fx).toBeLessThan(0);
      expect(f2.fx).toBeGreaterThan(0);
      // Equal and opposite
      expect(f1.fx).toBeCloseTo(-f2.fx);
    });

    it('generates wall repulsion force', () => {
      // Character near left wall
      const c = makeChar('c1', 0.2, 10); // x < CHARACTER_RADIUS(0.4)
      const world = makeWorld([c]);
      const forces = createForceMap();
      computeCollisionForces(world, forces);
      const f = forces.get('c1')!;
      expect(f.fx).toBeGreaterThan(0); // pushed away from wall
    });

    it('no force when characters are far apart', () => {
      const c1 = makeChar('c1', 5, 5);
      const c2 = makeChar('c2', 10, 10);
      const world = makeWorld([c1, c2]);
      const forces = createForceMap();
      computeCollisionForces(world, forces);
      expect(forces.has('c1')).toBe(false);
    });
  });

  describe('integration', () => {
    it('updates position from velocity', () => {
      const char = makeChar('c1', 10, 10, 1.0, 0.5);
      const world = makeWorld([char]);
      const forces = createForceMap();
      // No forces — just velocity carries forward
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
      const tiny = VELOCITY_CLAMP_THRESHOLD / 2;
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
      expect(c.position.x).toBeLessThanOrEqual(world.width - CHARACTER_RADIUS);
    });
  });
});
