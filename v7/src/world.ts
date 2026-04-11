/**
 * World helpers — object management, proximity queries, factory functions.
 */

import type {
  World,
  WorldObject,
  Position,
} from './types.js';

// ============================================================
// Distance
// ============================================================
export function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================
// Object ID management
// ============================================================
export function nextObjectId(world: World): { id: string; world: World } {
  const id = `obj-${String(world.nextObjectId).padStart(5, '0')}`;
  return {
    id,
    world: { ...world, nextObjectId: world.nextObjectId + 1 },
  };
}

// ============================================================
// Object CRUD
// ============================================================
export function addObject(world: World, obj: WorldObject): World {
  return { ...world, objects: [...world.objects, obj] };
}

export function removeObject(world: World, id: string): World {
  return { ...world, objects: world.objects.filter(o => o.id !== id) };
}

export function replaceObject(world: World, obj: WorldObject): World {
  return {
    ...world,
    objects: world.objects.map(o => o.id === obj.id ? obj : o),
  };
}

export function getObject(world: World, id: string): WorldObject | undefined {
  return world.objects.find(o => o.id === id);
}

// ============================================================
// Proximity queries
// ============================================================
export function findNearbyObjects(
  world: World,
  position: Position,
  range: number,
  excludeId?: string,
): readonly WorldObject[] {
  return world.objects.filter(o => {
    if (o.id === excludeId) return false;
    return distance(position, o.position) <= range;
  });
}

// ============================================================
// World factory
// ============================================================
export function createEmptyWorld(width: number, height: number): World {
  return {
    width,
    height,
    objects: [],
    nextObjectId: 1,
    tick: 0,
  };
}
