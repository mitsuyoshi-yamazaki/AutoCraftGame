import type { Recipe } from './types.js';

// ============================================================
// GameParams — all tunable parameters
// ============================================================
export interface GameParams {
  // World
  readonly proximityRange: number;
  readonly randomMovementRange: number;  // max distance per tick

  // Processor
  readonly instructionsPerTick: number;
  readonly processorMemorySize: number;
  readonly processorEnergyCostPerTick: number;  // 0 for v7.0.0

  // Assembler
  readonly absorptionPerTick: number;  // max material/energy units absorbed per tick

  // Recipes
  readonly recipes: readonly Recipe[];
}

// ============================================================
// Default recipes
// ============================================================
const DEFAULT_RECIPES: readonly Recipe[] = [
  {
    id: 1, output: 'Metal', outputKind: 'material', outputMaterialType: 'Metal',
    inputs: { Ore: 2 }, energyCost: 20, assembleTicks: 10,
  },
  {
    id: 2, output: 'Circuit', outputKind: 'material', outputMaterialType: 'Circuit',
    inputs: { Crystal: 2 }, energyCost: 20, assembleTicks: 10,
  },
  {
    id: 3, output: 'Assembler', outputKind: 'assembler',
    inputs: { Metal: 2, Circuit: 1 }, energyCost: 50, assembleTicks: 30,
  },
  {
    id: 4, output: 'Processor', outputKind: 'processor',
    inputs: { Circuit: 3 }, energyCost: 50, assembleTicks: 30,
  },
];

// ============================================================
// Default values
// ============================================================
export const DEFAULT_GAME_PARAMS: GameParams = {
  proximityRange: 3.0,
  randomMovementRange: 0.5,

  instructionsPerTick: 10000,
  processorMemorySize: 1024,
  processorEnergyCostPerTick: 0,

  absorptionPerTick: 1,

  recipes: DEFAULT_RECIPES,
};

// ============================================================
// Helpers
// ============================================================
export function getRecipeById(params: GameParams, id: number): Recipe | undefined {
  return params.recipes.find(r => r.id === id);
}
