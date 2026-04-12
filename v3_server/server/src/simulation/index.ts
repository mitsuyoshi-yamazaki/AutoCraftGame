// Types
export type {
  RawMaterial,
  ProcessedMaterial,
  ComponentType,
  Item,
  Inventory,
  Position,
  Velocity,
  Force,
  ResourceNodeType,
  ResourceNode,
  EnergyNode,
  Remains,
  GroundCell,
  GroundGrid,
  NearbyTargetType,
  Condition,
  MoveDirection,
  Action,
  FnValue,
  RegisterValue,
  SetRegister,
  Rule,
  Program,
  SenseData,
  Character,
  World,
  SimulationEvent,
  TickResult,
  ActionResult,
  ProcessRecipe,
  CraftRecipe,
} from './types.js';

// Params
export type { GameParams } from './params.js';
export { DEFAULT_GAME_PARAMS, getActionEnergyCost, getFailurePenalty } from './params.js';

// Constants
export {
  ENERGY_COST_MOVE,
  ENERGY_COST_HARVEST,
  ENERGY_COST_RECHARGE,
  ENERGY_COST_PROCESS,
  ENERGY_COST_CRAFT,
  ENERGY_COST_ASSEMBLE,
  ENERGY_COST_WRITE,
  ENERGY_COST_ACTIVATE,
  ENERGY_COST_SENSE,
  ENERGY_COST_REPAIR,
  ENERGY_COST_DISASSEMBLE,
  ACTION_FAILURE_COST_RATIO,
  METABOLISM,
  INVENTORY_METABOLISM_PER_ITEM,
  ENERGY_METABOLISM_THRESHOLD,
  ENERGY_METABOLISM_SCALE,
  RECHARGE_AMOUNT,
  ASSEMBLE_ENERGY_TRANSFER,
  REPAIR_AMOUNT,
  FRAME_DURABILITY,
  MOVE_FORCE,
  FRICTION_COEFFICIENT,
  COLLISION_STIFFNESS,
  VELOCITY_CLAMP_THRESHOLD,
  CHARACTER_RADIUS,
  RESOURCE_NODE_RADIUS,
  ENERGY_NODE_RADIUS,
  REMAINS_RADIUS,
  INTERACT_RANGE,
  SPAWN_DISTANCE,
  SENSE_RANGE,
  REGISTERS_PER_COMPONENT,
  AGING_THRESHOLD_N,
  AGING_THRESHOLD_M,
} from './constants.js';

// World
export type { Rng, WorldEngine, WorldConfig } from './world.js';
export {
  createRng,
  distance,
  circlesOverlap,
  buildCharacterIndex,
  createWorldEngine,
  depleteResourceNode,
  drainEnergyNode,
  produceEnergy,
  createRemains,
  addRemains,
  removeRemainsById,
  getCharacter,
  addCharacter,
  removeCharacter,
  nextCharacterId,
  nextObjectId,
  createWorld,
  DEFAULT_WORLD_CONFIG,
} from './world.js';

// Spatial grid
export type { GridEntryKind, GridEntry, SpatialGrid } from './spatial-grid.js';
export { buildGrid, queryRange } from './spatial-grid.js';

// Ground
export {
  createGroundGrid,
  groundGridDimensions,
  positionToCell,
  addToGround,
  itemToRaw,
  absorbRemains,
  getMooreSum,
  regenerateNodes,
  absorbOldRemains,
  computeSpillage,
} from './ground.js';

// Recipes
export type { RecipeEngine } from './recipes.js';
export {
  MIN_COMPONENTS,
  isComponentType,
  createRecipeEngine,
  hasItems,
  removeItems,
  addItem,
  addItems,
  inventoryTotalCount,
} from './recipes.js';

// Character
export type { CharacterEngine } from './character.js';
export {
  hasComponent,
  isActive,
  isDead,
  createCharacterEngine,
  readRegister,
  writeRegister,
} from './character.js';

// Physics
export type { ForceMap, PhysicsEngine } from './physics.js';
export { createForceMap, addForce, createPhysicsEngine } from './physics.js';

// Program
export type { ProgramEngine } from './program.js';
export { angleTo, createProgramEngine } from './program.js';

// Actions
export type { ActionEngineDeps, ActionEngine } from './actions.js';
export { createActionEngine } from './actions.js';

// Simulation
export type { SimulationEngine, SimulationEngineDeps } from './simulation.js';
export { createSimulationEngine } from './simulation.js';

// Engine
export type { Engine } from './engine.js';
export { createEngine } from './engine.js';

// Version
export { SemanticVersion, GAME_VERSION } from './version.js';

// Save/Load
export type { SaveData, SavedEvent } from './save-load.js';
export {
  serialize,
  deserialize,
  VersionMismatchError,
  formatTimestamp,
  buildSaveFileName,
} from './save-load.js';
