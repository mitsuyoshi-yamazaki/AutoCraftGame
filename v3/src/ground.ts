import type {
  GroundCell,
  GroundGrid,
  ComponentType,
  Remains,
  Position,
  ResourceNode,
  World,
} from './types.js';
import type { GameParams } from './params.js';
import { isComponentType } from './recipes.js';
import { nextObjectId } from './world.js';

// ============================================================
// GroundGrid creation
// ============================================================
export function createGroundGrid(gridWidth: number, gridHeight: number): GroundGrid {
  return Array.from({ length: gridWidth * gridHeight }, () => ({ ore: 0, crystal: 0 }));
}

export function groundGridDimensions(world: { width: number; height: number }): { gridWidth: number; gridHeight: number } {
  return { gridWidth: Math.floor(world.width), gridHeight: Math.floor(world.height) };
}

// ============================================================
// Cell coordinate helpers
// ============================================================
export function positionToCell(
  pos: Position,
  gridWidth: number,
  gridHeight: number,
): { cellX: number; cellY: number } {
  const cellX = Math.min(Math.floor(pos.x), gridWidth - 1);
  const cellY = Math.min(Math.floor(pos.y), gridHeight - 1);
  return { cellX, cellY };
}

function cellIndex(x: number, y: number, gridWidth: number): number {
  return y * gridWidth + x;
}

// ============================================================
// GroundGrid mutation (immutable)
// ============================================================
export function addToGround(
  grid: GroundGrid,
  gridWidth: number,
  gridHeight: number,
  pos: Position,
  ore: number,
  crystal: number,
): GroundGrid {
  const { cellX, cellY } = positionToCell(pos, gridWidth, gridHeight);
  const idx = cellIndex(cellX, cellY, gridWidth);
  const cell = grid[idx];
  return grid.map((c, i) =>
    i === idx ? { ore: c.ore + ore, crystal: c.crystal + crystal } : c,
  );
}

// ============================================================
// Material conversion: item/component → ore/crystal counts
// ============================================================
interface MaterialCount {
  readonly ore: number;
  readonly crystal: number;
}

function processedToRaw(item: string, count: number, params: GameParams): MaterialCount {
  // Metal → Ore, Circuit → Crystal via process recipe reversal
  const recipe = params.processRecipes.find((r) => r.output === item);
  if (recipe) {
    let ore = 0;
    let crystal = 0;
    for (const [input, inputCount] of Object.entries(recipe.inputs)) {
      if (input === 'Ore') ore += inputCount * count;
      else if (input === 'Crystal') crystal += inputCount * count;
    }
    return { ore, crystal };
  }
  // Raw material
  if (item === 'Ore') return { ore: count, crystal: 0 };
  if (item === 'Crystal') return { ore: 0, crystal: count };
  return { ore: 0, crystal: 0 };
}

function componentToRaw(component: string, params: GameParams): MaterialCount {
  const craftRecipe = params.craftRecipes.find((r) => r.output === component);
  if (!craftRecipe) return { ore: 0, crystal: 0 };
  let ore = 0;
  let crystal = 0;
  for (const [item, count] of Object.entries(craftRecipe.inputs)) {
    const raw = processedToRaw(item, count, params);
    ore += raw.ore;
    crystal += raw.crystal;
  }
  return { ore, crystal };
}

export function itemToRaw(item: string, count: number, params: GameParams): MaterialCount {
  if (isComponentType(item)) {
    const raw = componentToRaw(item, params);
    return { ore: raw.ore * count, crystal: raw.crystal * count };
  }
  return processedToRaw(item, count, params);
}

// ============================================================
// Remains absorption: convert all contents to ground materials
// ============================================================
export function absorbRemains(
  grid: GroundGrid,
  gridWidth: number,
  gridHeight: number,
  remains: Remains,
  params: GameParams,
): GroundGrid {
  let totalOre = 0;
  let totalCrystal = 0;

  // Inventory items
  for (const [item, count] of Object.entries(remains.inventory)) {
    if (count <= 0) continue;
    const raw = itemToRaw(item, count, params);
    totalOre += raw.ore;
    totalCrystal += raw.crystal;
  }

  // Components
  for (const comp of remains.components) {
    const raw = componentToRaw(comp, params);
    totalOre += raw.ore;
    totalCrystal += raw.crystal;
  }

  if (totalOre === 0 && totalCrystal === 0) return grid;
  return addToGround(grid, gridWidth, gridHeight, remains.position, totalOre, totalCrystal);
}

// ============================================================
// Moore neighborhood sum
// ============================================================
export function getMooreSum(
  grid: GroundGrid,
  gridWidth: number,
  gridHeight: number,
  cx: number,
  cy: number,
): GroundCell {
  let ore = 0;
  let crystal = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = cy + dy;
    if (ny < 0 || ny >= gridHeight) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx;
      if (nx < 0 || nx >= gridWidth) continue;
      const cell = grid[cellIndex(nx, ny, gridWidth)];
      ore += cell.ore;
      crystal += cell.crystal;
    }
  }
  return { ore, crystal };
}

// ============================================================
// Clear Moore neighborhood for a specific resource
// ============================================================
function clearMooreResource(
  grid: GroundGrid,
  gridWidth: number,
  gridHeight: number,
  cx: number,
  cy: number,
  resource: 'ore' | 'crystal',
): GroundGrid {
  const indicesToClear: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    const ny = cy + dy;
    if (ny < 0 || ny >= gridHeight) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx;
      if (nx < 0 || nx >= gridWidth) continue;
      indicesToClear.push(cellIndex(nx, ny, gridWidth));
    }
  }
  const clearSet = new Set(indicesToClear);
  return grid.map((cell, i) =>
    clearSet.has(i)
      ? (resource === 'ore' ? { ...cell, ore: 0 } : { ...cell, crystal: 0 })
      : cell,
  );
}

// ============================================================
// Resource node regeneration: scan grid + spawn nodes
// ============================================================
export function regenerateNodes(world: World, params: GameParams): World {
  const { gridWidth, gridHeight } = groundGridDimensions(world);
  let currentWorld = world;
  let grid = [...world.groundGrid];

  for (let cy = 0; cy < gridHeight; cy++) {
    for (let cx = 0; cx < gridWidth; cx++) {
      const sum = getMooreSum(grid, gridWidth, gridHeight, cx, cy);

      if (sum.ore >= params.nodeRegenerationThreshold) {
        const { id, world: w } = nextObjectId(currentWorld);
        currentWorld = w;
        const node: ResourceNode = {
          id,
          position: { x: cx + 0.5 + 0.2, y: cy + 0.5 },
          type: 'OreNode',
          remaining: sum.ore,
        };
        currentWorld = { ...currentWorld, resourceNodes: [...currentWorld.resourceNodes, node] };
        grid = [...clearMooreResource(grid, gridWidth, gridHeight, cx, cy, 'ore')];
      }

      if (sum.crystal >= params.nodeRegenerationThreshold) {
        const { id, world: w } = nextObjectId(currentWorld);
        currentWorld = w;
        const node: ResourceNode = {
          id,
          position: { x: cx + 0.5, y: cy + 0.5 + 0.2 },
          type: 'CrystalNode',
          remaining: sum.crystal,
        };
        currentWorld = { ...currentWorld, resourceNodes: [...currentWorld.resourceNodes, node] };
        grid = [...clearMooreResource(grid, gridWidth, gridHeight, cx, cy, 'crystal')];
      }
    }
  }

  return { ...currentWorld, groundGrid: grid };
}

// ============================================================
// Remains absorption step: absorb old remains into ground
// ============================================================
export function absorbOldRemains(world: World, params: GameParams): World {
  const { gridWidth, gridHeight } = groundGridDimensions(world);
  let grid = world.groundGrid;
  const surviving: Remains[] = [];

  for (const remains of world.remains) {
    if (world.tick - remains.createdAt >= params.remainsAbsorptionTicks) {
      grid = absorbRemains(grid, gridWidth, gridHeight, remains, params);
    } else {
      surviving.push(remains);
    }
  }

  return { ...world, remains: surviving, groundGrid: grid };
}

// ============================================================
// DISASSEMBLE spillage: compute ground addition for component
// ============================================================
export function computeSpillage(
  component: string,
  params: GameParams,
): MaterialCount {
  const spillage = params.disassembleSpillage[component as ComponentType];
  if (!spillage) return { ore: 0, crystal: 0 };

  let ore = 0;
  let crystal = 0;
  for (const [item, count] of Object.entries(spillage)) {
    const raw = processedToRaw(item, count, params);
    ore += raw.ore;
    crystal += raw.crystal;
  }
  return { ore, crystal };
}
