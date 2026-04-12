import type {
  ProcessRecipe,
  CraftRecipe,
  ComponentType,
  Inventory,
} from './types.js';
import type { GameParams } from './params.js';

// ============================================================
// Minimum components for a character (initialization default only)
// ============================================================
export const MIN_COMPONENTS: ComponentType[] = [
  'Frame',
  'Actuator',
  'Sensor',
  'Processor',
  'Harvester',
  'Assembler',
  'Charger',
  'MemoryCore',
];

// ============================================================
// All component types
// ============================================================
const COMPONENT_TYPES: string[] = [
  'Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester',
  'Assembler', 'Disassembler', 'Charger', 'MemoryCore', 'Register',
];

export function isComponentType(item: string): boolean {
  return COMPONENT_TYPES.includes(item);
}

// ============================================================
// RecipeEngine — param-dependent functions (maker pattern)
// ============================================================
export interface RecipeEngine {
  findProcessRecipe(output: string): ProcessRecipe | undefined;
  findCraftRecipe(output: string): CraftRecipe | undefined;
  getItemMass(item: string): number;
  calculateMass(components: ComponentType[], inventory: Inventory): number;
}

export function createRecipeEngine(params: GameParams): RecipeEngine {
  function findProcessRecipe(output: string): ProcessRecipe | undefined {
    return params.processRecipes.find((r) => r.output === output);
  }

  function findCraftRecipe(output: string): CraftRecipe | undefined {
    return params.craftRecipes.find((r) => r.output === output);
  }

  function getItemMass(item: string): number {
    if (item in params.componentMass) return params.componentMass[item as ComponentType];
    return params.rawMaterialMass[item] ?? 0;
  }

  function calculateMass(
    components: ComponentType[],
    inventory: Inventory,
  ): number {
    let mass = 0;
    for (const c of components) mass += params.componentMass[c];
    for (const [item, count] of Object.entries(inventory)) {
      if (count > 0) mass += getItemMass(item) * count;
    }
    return mass;
  }

  return { findProcessRecipe, findCraftRecipe, getItemMass, calculateMass };
}

export function hasItems(
  inventory: Inventory,
  required: Record<string, number>,
): boolean {
  return Object.entries(required).every(
    ([item, count]) => (inventory[item] ?? 0) >= count,
  );
}

// ============================================================
// Mutable inventory operations
// ============================================================
export function removeItems(
  inventory: Inventory,
  items: Record<string, number>,
): void {
  for (const [item, count] of Object.entries(items)) {
    inventory[item] = (inventory[item] ?? 0) - count;
    if (inventory[item] <= 0) delete inventory[item];
  }
}

export function addItem(
  inventory: Inventory,
  item: string,
  count: number = 1,
): void {
  inventory[item] = (inventory[item] ?? 0) + count;
}

export function addItems(
  inventory: Inventory,
  items: Record<string, number>,
): void {
  for (const [item, count] of Object.entries(items)) {
    inventory[item] = (inventory[item] ?? 0) + count;
  }
}

export function inventoryTotalCount(inventory: Inventory): number {
  return Object.values(inventory).reduce((sum, count) => sum + count, 0);
}
