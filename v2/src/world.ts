import type { World, ResourceNode, EnergyNode, Remains, Position, Character, ComponentType, Inventory } from './types.js';

// ============================================================
// Seeded PRNG — mulberry32
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

function randInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

// ============================================================
// Tile occupation check
// ============================================================
export function isOccupied(world: World, pos: Position): boolean {
  return (
    world.characters.some((c) => c.position.x === pos.x && c.position.y === pos.y) ||
    world.remains.some((r) => r.position.x === pos.x && r.position.y === pos.y) ||
    world.resourceNodes.some((n) => n.position.x === pos.x && n.position.y === pos.y) ||
    world.energyNodes.some((n) => n.position.x === pos.x && n.position.y === pos.y)
  );
}

export function isInBounds(world: World, pos: Position): boolean {
  return pos.x >= 0 && pos.x < world.width && pos.y >= 0 && pos.y < world.height;
}

// ============================================================
// ResourceNode operations
// ============================================================
export function findAdjacentResourceNode(world: World, pos: Position): ResourceNode | undefined {
  const dirs: Position[] = [
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
  ];
  for (const d of dirs) {
    const node = world.resourceNodes.find(
      (n) => n.position.x === d.x && n.position.y === d.y && n.remaining > 0,
    );
    if (node) return node;
  }
  return undefined;
}

export function depleteResourceNode(world: World, nodePos: Position): World {
  return {
    ...world,
    resourceNodes: world.resourceNodes.map((n) =>
      n.position.x === nodePos.x && n.position.y === nodePos.y
        ? { ...n, remaining: n.remaining - 1 }
        : n,
    ),
  };
}

export function removeDepletedNodes(world: World): World {
  return {
    ...world,
    resourceNodes: world.resourceNodes.filter((n) => n.remaining > 0),
  };
}

// ============================================================
// EnergyNode operations
// ============================================================
export function findAdjacentEnergyNode(world: World, pos: Position): EnergyNode | undefined {
  const dirs: Position[] = [
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
  ];
  for (const d of dirs) {
    const node = world.energyNodes.find(
      (n) => n.position.x === d.x && n.position.y === d.y && n.stored > 0,
    );
    if (node) return node;
  }
  return undefined;
}

export function drainEnergyNode(world: World, nodePos: Position, amount: number): World {
  return {
    ...world,
    energyNodes: world.energyNodes.map((n) =>
      n.position.x === nodePos.x && n.position.y === nodePos.y
        ? { ...n, stored: n.stored - amount }
        : n,
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
export function createRemains(pos: Position, components: readonly ComponentType[], inventory: Inventory): Remains {
  return { position: pos, components, inventory };
}

export function addRemains(world: World, remains: Remains): World {
  return { ...world, remains: [...world.remains, remains] };
}

export function findAdjacentRemains(world: World, pos: Position): Remains | undefined {
  const dirs: Position[] = [
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
  ];
  for (const d of dirs) {
    const r = world.remains.find(
      (rem) => rem.position.x === d.x && rem.position.y === d.y,
    );
    if (r) return r;
  }
  return undefined;
}

export function updateRemains(world: World, oldRemains: Remains, newRemains: Remains | null): World {
  if (newRemains === null) {
    return {
      ...world,
      remains: world.remains.filter(
        (r) => !(r.position.x === oldRemains.position.x && r.position.y === oldRemains.position.y),
      ),
    };
  }
  return {
    ...world,
    remains: world.remains.map((r) =>
      r.position.x === oldRemains.position.x && r.position.y === oldRemains.position.y
        ? newRemains
        : r,
    ),
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

export function removeCharacter(world: World, characterId: string): World {
  return {
    ...world,
    characters: world.characters.filter((c) => c.id !== characterId),
  };
}

export function getCharacter(world: World, id: string): Character | undefined {
  return world.characters.find((c) => c.id === id);
}

export function nextCharacterId(world: World): { id: string; world: World } {
  const id = `char-${String(world.nextCharacterId).padStart(3, '0')}`;
  return { id, world: { ...world, nextCharacterId: world.nextCharacterId + 1 } };
}

// ============================================================
// Create initial world
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
  width: 20,
  height: 20,
  oreNodeCount: 12,
  crystalNodeCount: 12,
  nodeRemaining: 50,
  energyNodeCount: 8,
  energyProductionRate: 200,
  energyMaxStored: 2000,
};

export function createWorld(config: WorldConfig, rng: Rng): World {
  const occupied = new Set<string>();
  const posKey = (x: number, y: number) => `${x},${y}`;

  function placeRandomly(count: number): Position[] {
    const positions: Position[] = [];
    let placed = 0;
    while (placed < count) {
      const x = randInt(rng, config.width);
      const y = randInt(rng, config.height);
      const key = posKey(x, y);
      if (!occupied.has(key)) {
        occupied.add(key);
        positions.push({ x, y });
        placed++;
      }
    }
    return positions;
  }

  const orePositions = placeRandomly(config.oreNodeCount);
  const crystalPositions = placeRandomly(config.crystalNodeCount);
  const energyPositions = placeRandomly(config.energyNodeCount);

  const resourceNodes: ResourceNode[] = [
    ...orePositions.map((p) => ({ position: p, type: 'OreNode' as const, remaining: config.nodeRemaining })),
    ...crystalPositions.map((p) => ({ position: p, type: 'CrystalNode' as const, remaining: config.nodeRemaining })),
  ];

  const energyNodes: EnergyNode[] = energyPositions.map((p) => ({
    position: p,
    productionRate: config.energyProductionRate,
    stored: config.energyMaxStored,
    maxStored: config.energyMaxStored,
  }));

  return {
    width: config.width,
    height: config.height,
    resourceNodes,
    energyNodes,
    remains: [],
    characters: [],
    nextCharacterId: 1,
    tick: 0,
  };
}

// Find nearest unoccupied tile to a target position
export function findNearestUnoccupied(world: World, target: Position): Position {
  if (!isOccupied(world, target)) return target;
  for (let radius = 1; radius < Math.max(world.width, world.height); radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const pos = { x: target.x + dx, y: target.y + dy };
        if (isInBounds(world, pos) && !isOccupied(world, pos)) return pos;
      }
    }
  }
  return target;
}
