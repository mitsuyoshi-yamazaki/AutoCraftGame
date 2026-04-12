import type { ComponentType, ProcessRecipe, CraftRecipe } from './types.js';

// ============================================================
// GameParams — all tunable parameters that affect simulation determinism
// ============================================================
export interface GameParams {
  energyCosts: Record<string, number>;
  actionFailureCostRatio: number;

  metabolism: Record<ComponentType, number>;
  inventoryMetabolismPerItem: number;
  energyMetabolismThreshold: number;
  energyMetabolismScale: number;

  rechargeAmount: number;
  assembleEnergyTransfer: number;
  repairAmount: number;

  frameDurability: number;
  durabilityDecayNormal: number;
  durabilityDecayStarving: number;

  moveForce: number;
  frictionCoefficient: number;
  collisionStiffness: number;
  velocityClampThreshold: number;

  characterRadius: number;
  resourceNodeRadius: number;
  energyNodeRadius: number;
  remainsRadius: number;

  interactRange: number;
  spawnDistance: number;
  senseRange: number;

  registersPerComponent: number;

  agingThresholdN: number;
  agingThresholdM: number;

  remainsAbsorptionTicks: number;
  nodeRegenerationThreshold: number;
  disassembleSpillage: Record<ComponentType, Record<string, number>>;

  processRecipes: ProcessRecipe[];
  craftRecipes: CraftRecipe[];

  rawMaterialMass: Record<string, number>;
  componentMass: Record<ComponentType, number>;
}

// ============================================================
// Default values
// ============================================================
export const DEFAULT_GAME_PARAMS: GameParams = {
  energyCosts: {
    NOOP: 0,
    MOVE: 10,
    HARVEST: 10,
    RECHARGE: 5,
    PROCESS: 20,
    CRAFT: 20,
    ASSEMBLE: 50,
    WRITE: 10,
    ACTIVATE: 10,
    SENSE: 5,
    REPAIR: 200,
    DISASSEMBLE: 15,
  },
  actionFailureCostRatio: 0.8,

  metabolism: {
    Frame: 1,
    Actuator: 2,
    Sensor: 2,
    Processor: 3,
    Harvester: 2,
    Assembler: 3,
    Disassembler: 2,
    Charger: 2,
    MemoryCore: 1,
    Register: 0,
  },
  inventoryMetabolismPerItem: 1,
  energyMetabolismThreshold: 3000,
  energyMetabolismScale: 9_000_000,

  rechargeAmount: 200,
  assembleEnergyTransfer: 500,
  repairAmount: 100,

  frameDurability: 300,
  durabilityDecayNormal: 1,
  durabilityDecayStarving: 2,

  moveForce: 80.0,
  frictionCoefficient: 0.8,
  collisionStiffness: 200.0,
  velocityClampThreshold: 0.01,

  characterRadius: 0.4,
  resourceNodeRadius: 0.4,
  energyNodeRadius: 0.4,
  remainsRadius: 0.3,

  interactRange: 1.5,
  spawnDistance: 1.2,
  senseRange: 10.0,

  registersPerComponent: 4,

  agingThresholdN: 3000,
  agingThresholdM: 6000,

  remainsAbsorptionTicks: 600,
  nodeRegenerationThreshold: 50,
  disassembleSpillage: {
    Frame: { Metal: 1 },
    Actuator: { Metal: 1 },
    Sensor: { Circuit: 1 },
    Processor: { Circuit: 1 },
    Harvester: { Metal: 1 },
    Assembler: { Metal: 1 },
    Disassembler: { Metal: 1 },
    Charger: { Circuit: 1 },
    MemoryCore: { Circuit: 1 },
    Register: {},
  },

  processRecipes: [
    { output: 'Metal', inputs: { Ore: 2 } },
    { output: 'Circuit', inputs: { Crystal: 2 } },
  ],
  craftRecipes: [
    { output: 'Frame', inputs: { Metal: 3 } },
    { output: 'Actuator', inputs: { Metal: 1, Circuit: 1 } },
    { output: 'Sensor', inputs: { Circuit: 2 } },
    { output: 'Processor', inputs: { Circuit: 3 } },
    { output: 'Harvester', inputs: { Metal: 2 } },
    { output: 'Assembler', inputs: { Metal: 2, Circuit: 1 } },
    { output: 'Disassembler', inputs: { Metal: 2, Circuit: 1 } },
    { output: 'Charger', inputs: { Metal: 1, Circuit: 2 } },
    { output: 'MemoryCore', inputs: { Circuit: 2 } },
    { output: 'Register', inputs: { Circuit: 1 } },
  ],

  rawMaterialMass: {
    Ore: 1,
    Crystal: 1,
    Metal: 2,
    Circuit: 2,
  },
  componentMass: {
    Frame: 6,
    Actuator: 4,
    Sensor: 4,
    Processor: 6,
    Harvester: 4,
    Assembler: 6,
    Disassembler: 6,
    Charger: 6,
    MemoryCore: 4,
    Register: 2,
  },
};

// ============================================================
// Helper: get energy cost for an action
// ============================================================
export function getActionEnergyCost(params: GameParams, op: string): number {
  if (op === 'ASSEMBLE') {
    return (params.energyCosts[op] ?? 0) + params.assembleEnergyTransfer;
  }
  return params.energyCosts[op] ?? 0;
}

export function getFailurePenalty(params: GameParams, cost: number): number {
  return Math.ceil(cost * params.actionFailureCostRatio);
}
