import type { World, ResourceNode, EnergyNode, Remains, Position, Character, ComponentType, Inventory } from './types.js';
import type { GameParams } from './params.js';
import { createGroundGrid, groundGridDimensions } from './ground.js';
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
// WorldEngine — param-dependent functions (maker pattern)
// ============================================================
export interface WorldEngine {
  getObjectRadius(kind: 'character' | 'resourceNode' | 'energyNode' | 'remains'): number;
  collidesWithAny(world: World, pos: Position, radius: number, excludeId?: string, grid?: SpatialGrid): boolean;
  findNearestResourceNode(world: World, pos: Position, grid?: SpatialGrid): ResourceNode | null;
  findNearestEnergyNode(world: World, pos: Position, grid?: SpatialGrid): EnergyNode | null;
  findNearestRemains(world: World, pos: Position, grid?: SpatialGrid): Remains | null;
  findNearestInactiveCharacter(world: World, pos: Position, selfId: string, grid?: SpatialGrid): Character | null;
  findSpawnPosition(world: World, parentPos: Position, parentVelocity: { vx: number; vy: number }, grid?: SpatialGrid): Position | null;
}

export function createWorldEngine(params: GameParams): WorldEngine {
  function getObjectRadius(kind: 'character' | 'resourceNode' | 'energyNode' | 'remains'): number {
    switch (kind) {
      case 'character': return params.characterRadius;
      case 'resourceNode': return params.resourceNodeRadius;
      case 'energyNode': return params.energyNodeRadius;
      case 'remains': return params.remainsRadius;
    }
  }

  function collidesWithAny(
    world: World, pos: Position, radius: number, excludeId?: string, grid?: SpatialGrid,
  ): boolean {
    if (grid) {
      const maxObjRadius = Math.max(params.characterRadius, params.resourceNodeRadius, params.energyNodeRadius, params.remainsRadius);
      const nearby = queryRange(grid, pos, radius + maxObjRadius);
      for (const entry of nearby) {
        if (entry.id === excludeId) continue;
        const otherRadius = getObjectRadius(entry.kind);
        if (circlesOverlap(pos, radius, entry.position, otherRadius)) return true;
      }
      return false;
    }
    for (const c of world.characters) {
      if (c.id === excludeId) continue;
      if (circlesOverlap(pos, radius, c.position, params.characterRadius)) return true;
    }
    for (const n of world.resourceNodes) {
      if (circlesOverlap(pos, radius, n.position, params.resourceNodeRadius)) return true;
    }
    for (const n of world.energyNodes) {
      if (circlesOverlap(pos, radius, n.position, params.energyNodeRadius)) return true;
    }
    for (const r of world.remains) {
      if (circlesOverlap(pos, radius, r.position, params.remainsRadius)) return true;
    }
    return false;
  }

  function findNearestResourceNode(
    world: World, pos: Position, grid?: SpatialGrid,
  ): ResourceNode | null {
    if (grid) {
      const nearby = queryRange(grid, pos, params.interactRange);
      let best: ResourceNode | null = null;
      let bestDist = Infinity;
      for (const entry of nearby) {
        if (entry.kind !== 'resourceNode') continue;
        const d = distance(pos, entry.position);
        if (d > params.interactRange || d >= bestDist) continue;
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
      if (d <= params.interactRange && d < bestDist) { bestDist = d; best = n; }
    }
    return best;
  }

  function findNearestEnergyNode(
    world: World, pos: Position, grid?: SpatialGrid,
  ): EnergyNode | null {
    if (grid) {
      const nearby = queryRange(grid, pos, params.interactRange);
      let best: EnergyNode | null = null;
      let bestDist = Infinity;
      for (const entry of nearby) {
        if (entry.kind !== 'energyNode') continue;
        const d = distance(pos, entry.position);
        if (d > params.interactRange || d >= bestDist) continue;
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
      if (d <= params.interactRange && d < bestDist) { bestDist = d; best = n; }
    }
    return best;
  }

  function findNearestRemains(
    world: World, pos: Position, grid?: SpatialGrid,
  ): Remains | null {
    if (grid) {
      const nearby = queryRange(grid, pos, params.interactRange);
      let best: Remains | null = null;
      let bestDist = Infinity;
      for (const entry of nearby) {
        if (entry.kind !== 'remains') continue;
        const d = distance(pos, entry.position);
        if (d > params.interactRange || d >= bestDist) continue;
        const r = world.remains.find((rm) => rm.id === entry.id);
        if (r) { bestDist = d; best = r; }
      }
      return best;
    }
    let best: Remains | null = null;
    let bestDist = Infinity;
    for (const r of world.remains) {
      const d = distance(pos, r.position);
      if (d <= params.interactRange && d < bestDist) { bestDist = d; best = r; }
    }
    return best;
  }

  function findNearestInactiveCharacter(
    world: World, pos: Position, selfId: string, grid?: SpatialGrid,
  ): Character | null {
    if (grid) {
      const nearby = queryRange(grid, pos, params.interactRange);
      let best: Character | null = null;
      let bestDist = Infinity;
      for (const entry of nearby) {
        if (entry.kind !== 'character' || entry.id === selfId) continue;
        const d = distance(pos, entry.position);
        if (d > params.interactRange || d >= bestDist) continue;
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
      if (d <= params.interactRange && d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  function findSpawnPositionFn(
    world: World, parentPos: Position, parentVelocity: { vx: number; vy: number },
    grid?: SpatialGrid,
  ): Position | null {
    const speed = Math.sqrt(parentVelocity.vx ** 2 + parentVelocity.vy ** 2);
    let baseAngle = 0;
    if (speed > 0.01) {
      baseAngle = Math.atan2(parentVelocity.vy, parentVelocity.vx) + Math.PI;
    }

    for (let i = 0; i < 4; i++) {
      const angle = baseAngle + (i * Math.PI) / 2;
      const pos: Position = {
        x: parentPos.x + Math.cos(angle) * params.spawnDistance,
        y: parentPos.y + Math.sin(angle) * params.spawnDistance,
      };
      if (pos.x > 0 && pos.x < world.width && pos.y > 0 && pos.y < world.height) {
        if (!collidesWithAny(world, pos, params.characterRadius, undefined, grid)) return pos;
      }
    }
    return null;
  }

  return {
    getObjectRadius,
    collidesWithAny,
    findNearestResourceNode,
    findNearestEnergyNode,
    findNearestRemains,
    findNearestInactiveCharacter,
    findSpawnPosition: findSpawnPositionFn,
  };
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
  createdAt: number,
): Remains {
  return { id, position, components, inventory, createdAt };
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
  oreNodeCount: 80,
  crystalNodeCount: 80,
  nodeRemaining: 225,
  energyNodeCount: 60,
  energyProductionRate: 75,
  energyMaxStored: 2000,
};

function randomPosition(rng: Rng, width: number, height: number, margin: number): Position {
  return {
    x: margin + rng() * (width - 2 * margin),
    y: margin + rng() * (height - 2 * margin),
  };
}

function findNonCollidingPosition(
  rng: Rng, world: World, radius: number, margin: number,
  worldEngine: WorldEngine, maxAttempts: number = 100,
): Position {
  for (let i = 0; i < maxAttempts; i++) {
    const pos = randomPosition(rng, world.width, world.height, margin);
    if (!worldEngine.collidesWithAny(world, pos, radius)) return pos;
  }
  return randomPosition(rng, world.width, world.height, margin);
}

export function createWorld(config: WorldConfig, rng: Rng, worldEngine: WorldEngine): World {
  const { gridWidth, gridHeight } = groundGridDimensions(config);
  let world: World = {
    width: config.width,
    height: config.height,
    resourceNodes: [],
    energyNodes: [],
    remains: [],
    characters: [],
    groundGrid: createGroundGrid(gridWidth, gridHeight),
    nextCharacterId: 1,
    nextObjectId: 1,
    tick: 0,
  };

  const margin = 1.0;
  const resourceNodeRadius = worldEngine.getObjectRadius('resourceNode');
  const energyNodeRadius = worldEngine.getObjectRadius('energyNode');

  // Place OreNodes
  for (let i = 0; i < config.oreNodeCount; i++) {
    const pos = findNonCollidingPosition(rng, world, resourceNodeRadius, margin, worldEngine);
    const { id, world: w } = nextObjectId(world);
    world = {
      ...w,
      resourceNodes: [...w.resourceNodes, { id, position: pos, type: 'OreNode', remaining: config.nodeRemaining, createdAt: 0 }],
    };
  }

  // Place CrystalNodes
  for (let i = 0; i < config.crystalNodeCount; i++) {
    const pos = findNonCollidingPosition(rng, world, resourceNodeRadius, margin, worldEngine);
    const { id, world: w } = nextObjectId(world);
    world = {
      ...w,
      resourceNodes: [...w.resourceNodes, { id, position: pos, type: 'CrystalNode', remaining: config.nodeRemaining, createdAt: 0 }],
    };
  }

  // Place EnergyNodes
  for (let i = 0; i < config.energyNodeCount; i++) {
    const pos = findNonCollidingPosition(rng, world, energyNodeRadius, margin, worldEngine);
    const { id, world: w } = nextObjectId(world);
    world = {
      ...w,
      energyNodes: [...w.energyNodes, {
        id, position: pos, productionRate: config.energyProductionRate,
        stored: config.energyMaxStored, maxStored: config.energyMaxStored,
        createdAt: 0,
      }],
    };
  }

  return world;
}
