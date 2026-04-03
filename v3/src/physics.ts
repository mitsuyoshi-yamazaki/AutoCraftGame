import type { World, Character, Position, Force } from './types.js';
import {
  FRICTION_COEFFICIENT,
  COLLISION_STIFFNESS,
  VELOCITY_CLAMP_THRESHOLD,
  CHARACTER_RADIUS,
  RESOURCE_NODE_RADIUS,
  ENERGY_NODE_RADIUS,
  REMAINS_RADIUS,
} from './constants.js';
import { calculateMass } from './recipes.js';
import { updateCharacter } from './world.js';

// ============================================================
// Accumulated forces per character (keyed by character id)
// ============================================================
export type ForceMap = Map<string, Force>;

export function createForceMap(): ForceMap {
  return new Map();
}

export function addForce(map: ForceMap, charId: string, force: Force): void {
  const existing = map.get(charId);
  if (existing) {
    map.set(charId, { fx: existing.fx + force.fx, fy: existing.fy + force.fy });
  } else {
    map.set(charId, force);
  }
}

// ============================================================
// Friction forces (Step 4)
// ============================================================
export function computeFrictionForces(world: World, forces: ForceMap): void {
  for (const char of world.characters) {
    const mass = calculateMass(char.components, char.inventory);
    const fx = -char.velocity.vx * FRICTION_COEFFICIENT * mass;
    const fy = -char.velocity.vy * FRICTION_COEFFICIENT * mass;
    addForce(forces, char.id, { fx, fy });
  }
}

// ============================================================
// Collision detection and response (Step 5)
// ============================================================
function computeCollisionForce(
  posA: Position, radiusA: number,
  posB: Position, radiusB: number,
): Force | null {
  const dx = posB.x - posA.x;
  const dy = posB.y - posA.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const overlap = radiusA + radiusB - dist;
  if (overlap <= 0) return null;

  if (dist < 0.001) {
    // Nearly coincident — push in arbitrary direction
    return { fx: -overlap * COLLISION_STIFFNESS, fy: 0 };
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const magnitude = overlap * COLLISION_STIFFNESS;
  return { fx: -nx * magnitude, fy: -ny * magnitude };
}

export function computeCollisionForces(world: World, forces: ForceMap): void {
  const chars = world.characters;

  // Character vs Character
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const f = computeCollisionForce(
        chars[i].position, CHARACTER_RADIUS,
        chars[j].position, CHARACTER_RADIUS,
      );
      if (f) {
        addForce(forces, chars[i].id, f);
        addForce(forces, chars[j].id, { fx: -f.fx, fy: -f.fy });
      }
    }
  }

  // Character vs fixed objects (ResourceNode, EnergyNode, Remains)
  for (const char of chars) {
    for (const n of world.resourceNodes) {
      const f = computeCollisionForce(char.position, CHARACTER_RADIUS, n.position, RESOURCE_NODE_RADIUS);
      if (f) addForce(forces, char.id, f);
    }
    for (const n of world.energyNodes) {
      const f = computeCollisionForce(char.position, CHARACTER_RADIUS, n.position, ENERGY_NODE_RADIUS);
      if (f) addForce(forces, char.id, f);
    }
    for (const r of world.remains) {
      const f = computeCollisionForce(char.position, CHARACTER_RADIUS, r.position, REMAINS_RADIUS);
      if (f) addForce(forces, char.id, f);
    }
  }

  // Character vs walls
  for (const char of chars) {
    // Left wall (x = 0)
    if (char.position.x < CHARACTER_RADIUS) {
      const overlap = CHARACTER_RADIUS - char.position.x;
      addForce(forces, char.id, { fx: overlap * COLLISION_STIFFNESS, fy: 0 });
    }
    // Right wall (x = width)
    if (char.position.x > world.width - CHARACTER_RADIUS) {
      const overlap = char.position.x - (world.width - CHARACTER_RADIUS);
      addForce(forces, char.id, { fx: -overlap * COLLISION_STIFFNESS, fy: 0 });
    }
    // Top wall (y = 0)
    if (char.position.y < CHARACTER_RADIUS) {
      const overlap = CHARACTER_RADIUS - char.position.y;
      addForce(forces, char.id, { fx: 0, fy: overlap * COLLISION_STIFFNESS });
    }
    // Bottom wall (y = height)
    if (char.position.y > world.height - CHARACTER_RADIUS) {
      const overlap = char.position.y - (world.height - CHARACTER_RADIUS);
      addForce(forces, char.id, { fx: 0, fy: -overlap * COLLISION_STIFFNESS });
    }
  }
}

// ============================================================
// Physics integration (Step 6): Semi-implicit Euler
// ============================================================
export function integratePhysics(world: World, forces: ForceMap): World {
  let w = world;
  for (const char of world.characters) {
    const mass = calculateMass(char.components, char.inventory);
    const f = forces.get(char.id) ?? { fx: 0, fy: 0 };

    const ax = f.fx / mass;
    const ay = f.fy / mass;

    let nvx = char.velocity.vx + ax;
    let nvy = char.velocity.vy + ay;

    // Velocity clamp
    if (nvx * nvx + nvy * nvy < VELOCITY_CLAMP_THRESHOLD * VELOCITY_CLAMP_THRESHOLD) {
      nvx = 0;
      nvy = 0;
    }

    const nx = char.position.x + nvx;
    const ny = char.position.y + nvy;

    // Clamp position to world bounds
    const cx = Math.max(CHARACTER_RADIUS, Math.min(world.width - CHARACTER_RADIUS, nx));
    const cy = Math.max(CHARACTER_RADIUS, Math.min(world.height - CHARACTER_RADIUS, ny));

    const updated: Character = {
      ...char,
      position: { x: cx, y: cy },
      velocity: { vx: nvx, vy: nvy },
    };
    w = updateCharacter(w, updated);
  }
  return w;
}
