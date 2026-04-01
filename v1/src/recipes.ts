import type {
  ProcessRecipe,
  CraftRecipe,
  ComponentType,
  Inventory,
} from "./types.js";

// ============================================================
// Layer 0 → Layer 1: Process recipes
// ============================================================
export const PROCESS_RECIPES: readonly ProcessRecipe[] = [
  { output: "Metal", inputs: { Ore: 2 } },
  { output: "Circuit", inputs: { Crystal: 2 } },
];

// ============================================================
// Layer 1 → Layer 2: Craft recipes
// ============================================================
export const CRAFT_RECIPES: readonly CraftRecipe[] = [
  { output: "Frame", inputs: { Metal: 3 } },
  { output: "Actuator", inputs: { Metal: 1, Circuit: 1 } },
  { output: "Sensor", inputs: { Circuit: 2 } },
  { output: "Processor", inputs: { Circuit: 3 } },
  { output: "Harvester", inputs: { Metal: 2 } },
  { output: "Assembler", inputs: { Metal: 2, Circuit: 1 } },
  { output: "MemoryCore", inputs: { Circuit: 2 } },
];

// ============================================================
// Minimum components for a character
// ============================================================
export const MIN_COMPONENTS: readonly ComponentType[] = [
  "Frame",
  "Actuator",
  "Sensor",
  "Processor",
  "Harvester",
  "Assembler",
  "MemoryCore",
];

// ============================================================
// Frame durability constant
// ============================================================
export const FRAME_DURABILITY = 200;

// ============================================================
// Helpers
// ============================================================

export function findProcessRecipe(output: string): ProcessRecipe | undefined {
  return PROCESS_RECIPES.find((r) => r.output === output);
}

export function findCraftRecipe(output: string): CraftRecipe | undefined {
  return CRAFT_RECIPES.find((r) => r.output === output);
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
    if (result[item] <= 0) {
      delete result[item];
    }
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
