import type {
  ProcessRecipe,
  CraftRecipe,
  ComponentType,
  Inventory,
} from './types.js';

// ============================================================
// Layer 0 → Layer 1: Process recipes
// ============================================================
export const PROCESS_RECIPES: readonly ProcessRecipe[] = [
  { output: 'Metal', inputs: { Ore: 2 } },
  { output: 'Circuit', inputs: { Crystal: 2 } },
];

// ============================================================
// Layer 1 → Layer 2: Craft recipes
// ============================================================
export const CRAFT_RECIPES: readonly CraftRecipe[] = [
  { output: 'Frame', inputs: { Metal: 3 } },
  { output: 'Actuator', inputs: { Metal: 1, Circuit: 1 } },
  { output: 'Sensor', inputs: { Circuit: 2 } },
  { output: 'Processor', inputs: { Circuit: 3 } },
  { output: 'Harvester', inputs: { Metal: 2 } },
  { output: 'Assembler', inputs: { Metal: 2, Circuit: 1 } },
  { output: 'Disassembler', inputs: { Metal: 2, Circuit: 1 } },
  { output: 'Charger', inputs: { Metal: 1, Circuit: 2 } },
  { output: 'MemoryCore', inputs: { Circuit: 2 } },
];

// ============================================================
// Minimum components for a character
// ============================================================
export const MIN_COMPONENTS: readonly ComponentType[] = [
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
// Mass calculation (v3: new)
// ============================================================
const RAW_MATERIAL_MASS: Readonly<Record<string, number>> = {
  Ore: 1,
  Crystal: 1,
  Metal: 2,
  Circuit: 2,
};

const COMPONENT_MASS: Readonly<Record<ComponentType, number>> = {
  Frame: 6,
  Actuator: 4,
  Sensor: 4,
  Processor: 6,
  Harvester: 4,
  Assembler: 6,
  Disassembler: 6,
  Charger: 6,
  MemoryCore: 4,
};

export function getItemMass(item: string): number {
  if (item in COMPONENT_MASS) return COMPONENT_MASS[item as ComponentType];
  return RAW_MATERIAL_MASS[item] ?? 0;
}

export function calculateMass(
  components: readonly ComponentType[],
  inventory: Inventory,
): number {
  let mass = 0;
  for (const c of components) mass += COMPONENT_MASS[c];
  for (const [item, count] of Object.entries(inventory)) {
    if (count > 0) mass += getItemMass(item) * count;
  }
  return mass;
}

// ============================================================
// All component types
// ============================================================
const COMPONENT_TYPES: readonly string[] = [
  'Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester',
  'Assembler', 'Disassembler', 'Charger', 'MemoryCore',
];

// ============================================================
// Helpers (same as v2)
// ============================================================
export function findProcessRecipe(output: string): ProcessRecipe | undefined {
  return PROCESS_RECIPES.find((r) => r.output === output);
}

export function findCraftRecipe(output: string): CraftRecipe | undefined {
  return CRAFT_RECIPES.find((r) => r.output === output);
}

export function isComponentType(item: string): boolean {
  return COMPONENT_TYPES.includes(item);
}

export function hasItems(
  inventory: Inventory,
  required: Readonly<Record<string, number>>,
): boolean {
  return Object.entries(required).every(
    ([item, count]) => (inventory[item] ?? 0) >= count,
  );
}

export function removeItems(
  inventory: Inventory,
  items: Readonly<Record<string, number>>,
): Inventory {
  const result = { ...inventory };
  for (const [item, count] of Object.entries(items)) {
    result[item] = (result[item] ?? 0) - count;
    if (result[item] <= 0) delete result[item];
  }
  return result;
}

export function addItem(
  inventory: Inventory,
  item: string,
  count: number = 1,
): Inventory {
  return { ...inventory, [item]: (inventory[item] ?? 0) + count };
}

export function addItems(
  inventory: Inventory,
  items: Readonly<Record<string, number>>,
): Inventory {
  let result = { ...inventory };
  for (const [item, count] of Object.entries(items)) {
    result = { ...result, [item]: (result[item] ?? 0) + count };
  }
  return result;
}

export function inventoryTotalCount(inventory: Inventory): number {
  return Object.values(inventory).reduce((sum, count) => sum + count, 0);
}
