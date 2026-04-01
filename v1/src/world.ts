import type { World, ResourceNode, Position, Character } from './types.js';

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

/** Generate a random integer in [0, max) */
function randInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

// ============================================================
// Resource node regeneration — undeplete all nodes each tick
// ============================================================
export function regenerateResources(world: World): World {
  return {
    ...world,
    resourceNodes: world.resourceNodes.map((node) =>
      node.depleted ? { ...node, depleted: false } : node,
    ),
  };
}

// ============================================================
// Find resource node at position
// ============================================================
export function resourceNodeAt(world: World, pos: Position): ResourceNode | undefined {
  return world.resourceNodes.find(
    (n) => n.position.x === pos.x && n.position.y === pos.y && !n.depleted,
  );
}

// ============================================================
// Deplete a resource node
// ============================================================
export function depleteNode(world: World, pos: Position): World {
  return {
    ...world,
    resourceNodes: world.resourceNodes.map((n) =>
      n.position.x === pos.x && n.position.y === pos.y ? { ...n, depleted: true } : n,
    ),
  };
}

// ============================================================
// Update a character in the world
// ============================================================
export function updateCharacter(world: World, character: Character): World {
  return {
    ...world,
    characters: world.characters.map((c) => (c.id === character.id ? character : c)),
  };
}

// ============================================================
// Add a character to the world
// ============================================================
export function addCharacter(world: World, character: Character): World {
  return {
    ...world,
    characters: [...world.characters, character],
  };
}

// ============================================================
// Remove a character from the world
// ============================================================
export function removeCharacter(world: World, characterId: string): World {
  return {
    ...world,
    characters: world.characters.filter((c) => c.id !== characterId),
  };
}

// ============================================================
// Get character by id
// ============================================================
export function getCharacter(world: World, id: string): Character | undefined {
  return world.characters.find((c) => c.id === id);
}

// ============================================================
// Check position is within map bounds
// ============================================================
export function isInBounds(world: World, pos: Position): boolean {
  return pos.x >= 0 && pos.x < world.width && pos.y >= 0 && pos.y < world.height;
}

// ============================================================
// Resource node counts per type
// ============================================================
const NODES_PER_TYPE = 12;

// ============================================================
// Create initial world with randomly placed resource nodes
// ============================================================
export function createWorld(width: number, height: number, rng: Rng): World {
  const occupied = new Set<string>();
  const resourceNodes: ResourceNode[] = [];

  function placeNodes(type: 'OreNode' | 'CrystalNode', count: number): void {
    let placed = 0;
    while (placed < count) {
      const x = randInt(rng, width);
      const y = randInt(rng, height);
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        occupied.add(key);
        resourceNodes.push({ position: { x, y }, type, depleted: false });
        placed++;
      }
    }
  }

  placeNodes('OreNode', NODES_PER_TYPE);
  placeNodes('CrystalNode', NODES_PER_TYPE);

  return {
    width,
    height,
    resourceNodes,
    characters: [],
    nextCharacterId: 1,
    tick: 0,
  };
}

// ============================================================
// Generate next character id
// ============================================================
export function nextCharacterId(world: World): { id: string; world: World } {
  const id = `char-${String(world.nextCharacterId).padStart(3, '0')}`;
  return { id, world: { ...world, nextCharacterId: world.nextCharacterId + 1 } };
}
