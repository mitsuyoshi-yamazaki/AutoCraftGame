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
// GroundGrid mutation (MUTABLE: direct cell update)
// ============================================================
export function addToGround(
  grid: GroundGrid,
  gridWidth: number,
  gridHeight: number,
  pos: Position,
  ore: number,
  crystal: number,
): void {
  const { cellX, cellY } = positionToCell(pos, gridWidth, gridHeight);
  const idx = cellIndex(cellX, cellY, gridWidth);
  grid[idx].ore += ore;
  grid[idx].crystal += crystal;
}

// ============================================================
// Material conversion: item/component → ore/crystal counts
// ============================================================
interface MaterialCount {
  ore: number;
  crystal: number;
}

function processedToRaw(item: string, count: number, params: GameParams): MaterialCount {
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
// (MUTABLE: directly mutates grid)
// ============================================================
export function absorbRemains(
  grid: GroundGrid,
  gridWidth: number,
  gridHeight: number,
  remains: Remains,
  params: GameParams,
): void {
  let totalOre = 0;
  let totalCrystal = 0;

  for (const [item, count] of Object.entries(remains.inventory)) {
    if (count <= 0) continue;
    const raw = itemToRaw(item, count, params);
    totalOre += raw.ore;
    totalCrystal += raw.crystal;
  }

  for (const comp of remains.components) {
    const raw = componentToRaw(comp, params);
    totalOre += raw.ore;
    totalCrystal += raw.crystal;
  }

  if (totalOre === 0 && totalCrystal === 0) return;
  addToGround(grid, gridWidth, gridHeight, remains.position, totalOre, totalCrystal);
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
// (MUTABLE: directly zeroes cells)
// ============================================================
function clearMooreResource(
  grid: GroundGrid,
  gridWidth: number,
  gridHeight: number,
  cx: number,
  cy: number,
  resource: 'ore' | 'crystal',
): void {
  for (let dy = -1; dy <= 1; dy++) {
    const ny = cy + dy;
    if (ny < 0 || ny >= gridHeight) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx;
      if (nx < 0 || nx >= gridWidth) continue;
      grid[cellIndex(nx, ny, gridWidth)][resource] = 0;
    }
  }
}

// ============================================================
// Resource node regeneration: scan grid + spawn nodes
// (MUTABLE: mutates world in place)
// ============================================================
export function regenerateNodes(world: World, params: GameParams): void {
  const { gridWidth, gridHeight } = groundGridDimensions(world);
  const grid = world.groundGrid;

  for (let cy = 0; cy < gridHeight; cy++) {
    for (let cx = 0; cx < gridWidth; cx++) {
      const sum = getMooreSum(grid, gridWidth, gridHeight, cx, cy);

      if (sum.ore >= params.nodeRegenerationThreshold) {
        const id = `obj-${String(world.nextObjectId).padStart(3, '0')}`;
        world.nextObjectId++;
        const node: ResourceNode = {
          id,
          position: { x: cx + 0.5 + 0.2, y: cy + 0.5 },
          type: 'OreNode',
          remaining: sum.ore,
          createdAt: world.tick,
        };
        world.resourceNodes.push(node);
        clearMooreResource(grid, gridWidth, gridHeight, cx, cy, 'ore');
      }

      if (sum.crystal >= params.nodeRegenerationThreshold) {
        const id = `obj-${String(world.nextObjectId).padStart(3, '0')}`;
        world.nextObjectId++;
        const node: ResourceNode = {
          id,
          position: { x: cx + 0.5, y: cy + 0.5 + 0.2 },
          type: 'CrystalNode',
          remaining: sum.crystal,
          createdAt: world.tick,
        };
        world.resourceNodes.push(node);
        clearMooreResource(grid, gridWidth, gridHeight, cx, cy, 'crystal');
      }
    }
  }
}

// ============================================================
// Remains absorption step: absorb old remains into ground
// (MUTABLE: mutates world in place)
// ============================================================
export function absorbOldRemains(world: World, params: GameParams): void {
  const { gridWidth, gridHeight } = groundGridDimensions(world);
  const surviving: Remains[] = [];

  for (const remains of world.remains) {
    if (world.tick - remains.createdAt >= params.remainsAbsorptionTicks) {
      absorbRemains(world.groundGrid, gridWidth, gridHeight, remains, params);
    } else {
      surviving.push(remains);
    }
  }

  world.remains = surviving;
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
