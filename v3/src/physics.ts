import type { World, Character, Position, Force } from './types.js';
import type { GameParams } from './params.js';
import type { RecipeEngine } from './recipes.js';
import type { WorldEngine } from './world.js';
import { updateCharacter } from './world.js';
import type { SpatialGrid } from './spatial-grid.js';
import { queryRange } from './spatial-grid.js';

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
// PhysicsEngine — param-dependent functions (maker pattern)
// ============================================================
export interface PhysicsEngine {
  computeFrictionForces(world: World, forces: ForceMap): void;
  computeCollisionForces(world: World, forces: ForceMap, grid: SpatialGrid): void;
  integratePhysics(world: World, forces: ForceMap): World;
}

export function createPhysicsEngine(
  params: GameParams,
  recipeEngine: RecipeEngine,
  worldEngine: WorldEngine,
): PhysicsEngine {

  function computeFrictionForces(world: World, forces: ForceMap): void {
    for (const char of world.characters) {
      const mass = recipeEngine.calculateMass(char.components, char.inventory);
      const fx = -char.velocity.vx * params.frictionCoefficient * mass;
      const fy = -char.velocity.vy * params.frictionCoefficient * mass;
      addForce(forces, char.id, { fx, fy });
    }
  }

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
      return { fx: -overlap * params.collisionStiffness, fy: 0 };
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const magnitude = overlap * params.collisionStiffness;
    return { fx: -nx * magnitude, fy: -ny * magnitude };
  }

  function computeCollisionForces(world: World, forces: ForceMap, grid: SpatialGrid): void {
    const chars = world.characters;
    const maxCollisionDist = params.characterRadius + Math.max(
      params.resourceNodeRadius, params.energyNodeRadius, params.remainsRadius,
    );
    const processed = new Set<string>();

    for (const char of chars) {
      processed.add(char.id);
      const nearby = queryRange(grid, char.position, maxCollisionDist);

      for (const entry of nearby) {
        if (entry.id === char.id) continue;

        if (entry.kind === 'character') {
          if (processed.has(entry.id)) continue;
          const f = computeCollisionForce(
            char.position, params.characterRadius,
            entry.position, params.characterRadius,
          );
          if (f) {
            addForce(forces, char.id, f);
            addForce(forces, entry.id, { fx: -f.fx, fy: -f.fy });
          }
        } else {
          const otherRadius = worldEngine.getObjectRadius(entry.kind);
          const f = computeCollisionForce(char.position, params.characterRadius, entry.position, otherRadius);
          if (f) addForce(forces, char.id, f);
        }
      }
    }

    // Character vs walls
    for (const char of chars) {
      if (char.position.x < params.characterRadius) {
        const overlap = params.characterRadius - char.position.x;
        addForce(forces, char.id, { fx: overlap * params.collisionStiffness, fy: 0 });
      }
      if (char.position.x > world.width - params.characterRadius) {
        const overlap = char.position.x - (world.width - params.characterRadius);
        addForce(forces, char.id, { fx: -overlap * params.collisionStiffness, fy: 0 });
      }
      if (char.position.y < params.characterRadius) {
        const overlap = params.characterRadius - char.position.y;
        addForce(forces, char.id, { fx: 0, fy: overlap * params.collisionStiffness });
      }
      if (char.position.y > world.height - params.characterRadius) {
        const overlap = char.position.y - (world.height - params.characterRadius);
        addForce(forces, char.id, { fx: 0, fy: -overlap * params.collisionStiffness });
      }
    }
  }

  function integratePhysics(world: World, forces: ForceMap): World {
    let w = world;
    for (const char of world.characters) {
      const mass = recipeEngine.calculateMass(char.components, char.inventory);
      const f = forces.get(char.id) ?? { fx: 0, fy: 0 };

      const ax = f.fx / mass;
      const ay = f.fy / mass;

      let nvx = char.velocity.vx + ax;
      let nvy = char.velocity.vy + ay;

      if (nvx * nvx + nvy * nvy < params.velocityClampThreshold * params.velocityClampThreshold) {
        nvx = 0;
        nvy = 0;
      }

      const nx = char.position.x + nvx;
      const ny = char.position.y + nvy;

      const cx = Math.max(params.characterRadius, Math.min(world.width - params.characterRadius, nx));
      const cy = Math.max(params.characterRadius, Math.min(world.height - params.characterRadius, ny));

      const updated: Character = {
        ...char,
        position: { x: cx, y: cy },
        velocity: { vx: nvx, vy: nvy },
      };
      w = updateCharacter(w, updated);
    }
    return w;
  }

  return { computeFrictionForces, computeCollisionForces, integratePhysics };
}
