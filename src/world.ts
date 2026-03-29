import type { World, ResourceNode, Position, Character } from './types.js';

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
// Create initial world with scattered resource nodes
// ============================================================
export function createWorld(width: number, height: number): World {
  const resourceNodes: ResourceNode[] = [];

  // Place Ore nodes in the left half, Crystal nodes in the right half
  // Simple deterministic placement for prototype
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < Math.floor(width / 2); x += 3) {
      resourceNodes.push({ position: { x, y }, type: 'OreNode', depleted: false });
    }
    for (let x = Math.floor(width / 2); x < width; x += 3) {
      resourceNodes.push({ position: { x, y }, type: 'CrystalNode', depleted: false });
    }
  }

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
