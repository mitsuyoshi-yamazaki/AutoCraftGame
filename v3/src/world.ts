import type { World, ResourceNode, EnergyNode, Remains, Position, Character, ComponentType, Inventory } from './types.js';
import { INTERACT_RANGE, RESOURCE_NODE_RADIUS, ENERGY_NODE_RADIUS, CHARACTER_RADIUS, REMAINS_RADIUS } from './constants.js';
import type { SpatialGrid } from './spatial-grid.js';
import { queryRange } from './spatial-grid.js';

// ============================================================
// Seeded PRNG — mulberry32 (same as v2)
// ============================================================
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// Euclidean distance (v3: replaces Chebyshev)
// ============================================================
export function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================
// Collision check: do two circles overlap?
// ============================================================
export function circlesOverlap(
  posA: Position, radiusA: number,
  posB: Position, radiusB: number,
): boolean {
  return distance(posA, posB) < radiusA + radiusB;
}

// ============================================================
// Get radius for object type
// ============================================================
export function getObjectRadius(kind: 'character' | 'resourceNode' | 'energyNode' | 'remains'): number {
  switch (kind) {
    case 'character': return CHARACTER_RADIUS;
    case 'resourceNode': return RESOURCE_NODE_RADIUS;
    case 'energyNode': return ENERGY_NODE_RADIUS;
    case 'remains': return REMAINS_RADIUS;
  }
}

// ============================================================
// Check if a position collides with any existing object
// ============================================================
export function collidesWithAny(
  world: World, pos: Position, radius: number, excludeId?: string, grid?: SpatialGrid,
): boolean {
  if (grid) {
    const maxObjRadius = Math.max(CHARACTER_RADIUS, RESOURCE_NODE_RADIUS, ENERGY_NODE_RADIUS, REMAINS_RADIUS);
    const nearby = queryRange(grid, pos, radius + maxObjRadius);
    for (const entry of nearby) {
      if (entry.id === excludeId) continue;
      const otherRadius = getObjectRadius(entry.kind);
      if (circlesOverlap(pos, radius, entry.position, otherRadius)) return true;
    }
    return false;
  }
  // Fallback: linear scan (used during world creation when no grid exists)
  for (const c of world.characters) {
    if (c.id === excludeId) continue;
    if (circlesOverlap(pos, radius, c.position, CHARACTER_RADIUS)) return true;
  }
  for (const n of world.resourceNodes) {
    if (circlesOverlap(pos, radius, n.position, RESOURCE_NODE_RADIUS)) return true;
  }
  for (const n of world.energyNodes) {
    if (circlesOverlap(pos, radius, n.position, ENERGY_NODE_RADIUS)) return true;
  }
  for (const r of world.remains) {
    if (circlesOverlap(pos, radius, r.position, REMAINS_RADIUS)) return true;
  }
  return false;
}

// ============================================================
// Find nearest object within INTERACT_RANGE
// ============================================================
export function findNearestResourceNode(
  world: World, pos: Position, grid?: SpatialGrid,
): ResourceNode | null {
  if (grid) {
    const nearby = queryRange(grid, pos, INTERACT_RANGE);
    let best: ResourceNode | null = null;
    let bestDist = Infinity;
    for (const entry of nearby) {
      if (entry.kind !== 'resourceNode') continue;
      const d = distance(pos, entry.position);
      if (d > INTERACT_RANGE || d >= bestDist) continue;
      const node = world.resourceNodes.find((n) => n.id === entry.id);
      if (node && node.remaining > 0) { bestDist = d; best = node; }
    }
    return best;
  }
  let best: ResourceNode | null = null;
  let bestDist = Infinity;
  for (const n of world.resourceNodes) {
    if (n.remaining <= 0) continue;
    const d = distance(pos, n.position);
    if (d <= INTERACT_RANGE && d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

export function findNearestEnergyNode(
  world: World, pos: Position, grid?: SpatialGrid,
): EnergyNode | null {
  if (grid) {
    const nearby = queryRange(grid, pos, INTERACT_RANGE);
    let best: EnergyNode | null = null;
    let bestDist = Infinity;
    for (const entry of nearby) {
      if (entry.kind !== 'energyNode') continue;
      const d = distance(pos, entry.position);
      if (d > INTERACT_RANGE || d >= bestDist) continue;
      const node = world.energyNodes.find((n) => n.id === entry.id);
      if (node && node.stored > 0) { bestDist = d; best = node; }
    }
    return best;
  }
  let best: EnergyNode | null = null;
  let bestDist = Infinity;
  for (const n of world.energyNodes) {
    if (n.stored <= 0) continue;
    const d = distance(pos, n.position);
    if (d <= INTERACT_RANGE && d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

export function findNearestRemains(
  world: World, pos: Position, grid?: SpatialGrid,
): Remains | null {
  if (grid) {
    const nearby = queryRange(grid, pos, INTERACT_RANGE);
    let best: Remains | null = null;
    let bestDist = Infinity;
    for (const entry of nearby) {
      if (entry.kind !== 'remains') continue;
      const d = distance(pos, entry.position);
      if (d > INTERACT_RANGE || d >= bestDist) continue;
      const r = world.remains.find((rm) => rm.id === entry.id);
      if (r) { bestDist = d; best = r; }
    }
    return best;
  }
  let best: Remains | null = null;
  let bestDist = Infinity;
  for (const r of world.remains) {
    const d = distance(pos, r.position);
    if (d <= INTERACT_RANGE && d < bestDist) { bestDist = d; best = r; }
  }
  return best;
}

export function findNearestInactiveCharacter(
  world: World, pos: Position, selfId: string, grid?: SpatialGrid,
): Character | null {
  if (grid) {
    const nearby = queryRange(grid, pos, INTERACT_RANGE);
    let best: Character | null = null;
    let bestDist = Infinity;
    for (const entry of nearby) {
      if (entry.kind !== 'character' || entry.id === selfId) continue;
      const d = distance(pos, entry.position);
      if (d > INTERACT_RANGE || d >= bestDist) continue;
      const c = world.characters.find((ch) => ch.id === entry.id);
      if (c && c.program === null) { bestDist = d; best = c; }
    }
    return best;
  }
  let best: Character | null = null;
  let bestDist = Infinity;
  for (const c of world.characters) {
    if (c.id === selfId || c.program !== null) continue;
    const d = distance(pos, c.position);
    if (d <= INTERACT_RANGE && d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

// ============================================================
// ResourceNode operations
// ============================================================
export function depleteResourceNode(world: World, nodeId: string): World {
  const nodes = world.resourceNodes.map((n) =>
    n.id === nodeId ? { ...n, remaining: n.remaining - 1 } : n,
  );
  return { ...world, resourceNodes: nodes.filter((n) => n.remaining > 0) };
}

// ============================================================
// EnergyNode operations
// ============================================================
export function drainEnergyNode(world: World, nodeId: string, amount: number): World {
  return {
    ...world,
    energyNodes: world.energyNodes.map((n) =>
      n.id === nodeId ? { ...n, stored: n.stored - amount } : n,
    ),
  };
}

export function produceEnergy(world: World): World {
  return {
    ...world,
    energyNodes: world.energyNodes.map((n) => ({
      ...n,
      stored: Math.min(n.stored + n.productionRate, n.maxStored),
    })),
  };
}

// ============================================================
// Remains operations
// ============================================================
export function createRemains(
  id: string,
  position: Position,
  components: readonly ComponentType[],
  inventory: Inventory,
): Remains {
  return { id, position, components, inventory };
}

export function addRemains(world: World, remains: Remains): World {
  return { ...world, remains: [...world.remains, remains] };
}

export function updateRemains(world: World, oldRemains: Remains, newRemains: Remains | null): World {
  if (newRemains === null) {
    return { ...world, remains: world.remains.filter((r) => r.id !== oldRemains.id) };
  }
  return {
    ...world,
    remains: world.remains.map((r) => (r.id === oldRemains.id ? newRemains : r)),
  };
}

// ============================================================
// Character operations
// ============================================================
export function updateCharacter(world: World, character: Character): World {
  return {
    ...world,
    characters: world.characters.map((c) => (c.id === character.id ? character : c)),
  };
}

export function addCharacter(world: World, character: Character): World {
  return { ...world, characters: [...world.characters, character] };
}

export function removeCharacter(world: World, id: string): World {
  return { ...world, characters: world.characters.filter((c) => c.id !== id) };
}

export function getCharacter(world: World, id: string): Character | undefined {
  return world.characters.find((c) => c.id === id);
}

export function nextCharacterId(world: World): { id: string; world: World } {
  const id = `char-${String(world.nextCharacterId).padStart(3, '0')}`;
  return { id, world: { ...world, nextCharacterId: world.nextCharacterId + 1 } };
}

export function nextObjectId(world: World): { id: string; world: World } {
  const id = `obj-${String(world.nextObjectId).padStart(3, '0')}`;
  return { id, world: { ...world, nextObjectId: world.nextObjectId + 1 } };
}

// ============================================================
// World creation (v3: continuous space)
// ============================================================
export interface WorldConfig {
  readonly width: number;
  readonly height: number;
  readonly oreNodeCount: number;
  readonly crystalNodeCount: number;
  readonly nodeRemaining: number;
  readonly energyNodeCount: number;
  readonly energyProductionRate: number;
  readonly energyMaxStored: number;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  width: 60,
  height: 60,
  oreNodeCount: 50,
  crystalNodeCount: 50,
  nodeRemaining: 80,
  energyNodeCount: 40,
  energyProductionRate: 75,
  energyMaxStored: 3000,
};

function randomPosition(rng: Rng, width: number, height: number, margin: number): Position {
  return {
    x: margin + rng() * (width - 2 * margin),
    y: margin + rng() * (height - 2 * margin),
  };
}

function findNonCollidingPosition(
  rng: Rng, world: World, radius: number, margin: number, maxAttempts: number = 100,
): Position {
  for (let i = 0; i < maxAttempts; i++) {
    const pos = randomPosition(rng, world.width, world.height, margin);
    if (!collidesWithAny(world, pos, radius)) return pos;
  }
  return randomPosition(rng, world.width, world.height, margin);
}

export function createWorld(config: WorldConfig, rng: Rng): World {
  let world: World = {
    width: config.width,
    height: config.height,
    resourceNodes: [],
    energyNodes: [],
    remains: [],
    characters: [],
    nextCharacterId: 1,
    nextObjectId: 1,
    tick: 0,
  };

  const margin = 1.0;

  // Place OreNodes
  for (let i = 0; i < config.oreNodeCount; i++) {
    const pos = findNonCollidingPosition(rng, world, RESOURCE_NODE_RADIUS, margin);
    const { id, world: w } = nextObjectId(world);
    world = {
      ...w,
      resourceNodes: [...w.resourceNodes, { id, position: pos, type: 'OreNode', remaining: config.nodeRemaining }],
    };
  }

  // Place CrystalNodes
  for (let i = 0; i < config.crystalNodeCount; i++) {
    const pos = findNonCollidingPosition(rng, world, RESOURCE_NODE_RADIUS, margin);
    const { id, world: w } = nextObjectId(world);
    world = {
      ...w,
      resourceNodes: [...w.resourceNodes, { id, position: pos, type: 'CrystalNode', remaining: config.nodeRemaining }],
    };
  }

  // Place EnergyNodes
  for (let i = 0; i < config.energyNodeCount; i++) {
    const pos = findNonCollidingPosition(rng, world, ENERGY_NODE_RADIUS, margin);
    const { id, world: w } = nextObjectId(world);
    world = {
      ...w,
      energyNodes: [...w.energyNodes, {
        id, position: pos, productionRate: config.energyProductionRate,
        stored: config.energyMaxStored, maxStored: config.energyMaxStored,
      }],
    };
  }

  return world;
}

// ============================================================
// Find a non-colliding position near a target (for spawning)
// ============================================================
export function findSpawnPosition(
  world: World, parentPos: Position, parentVelocity: { vx: number; vy: number },
  spawnDistance: number, grid?: SpatialGrid,
): Position | null {
  // Try opposite of parent velocity first, then rotate 90 deg increments
  const speed = Math.sqrt(parentVelocity.vx ** 2 + parentVelocity.vy ** 2);
  let baseAngle = 0; // 0 degrees (right) as default
  if (speed > 0.01) {
    baseAngle = Math.atan2(parentVelocity.vy, parentVelocity.vx) + Math.PI; // opposite
  }

  for (let i = 0; i < 4; i++) {
    const angle = baseAngle + (i * Math.PI) / 2;
    const pos: Position = {
      x: parentPos.x + Math.cos(angle) * spawnDistance,
      y: parentPos.y + Math.sin(angle) * spawnDistance,
    };
    if (pos.x > 0 && pos.x < world.width && pos.y > 0 && pos.y < world.height) {
      if (!collidesWithAny(world, pos, CHARACTER_RADIUS, undefined, grid)) return pos;
    }
  }
  return null;
}
