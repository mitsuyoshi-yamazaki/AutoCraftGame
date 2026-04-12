// ============================================================
// Layer 0: Raw materials
// ============================================================
export type RawMaterial = 'Ore' | 'Crystal';

// ============================================================
// Layer 1: Processed materials
// ============================================================
export type ProcessedMaterial = 'Metal' | 'Circuit';

// ============================================================
// Layer 2: Components
// ============================================================
export type ComponentType =
  | 'Frame'
  | 'Actuator'
  | 'Sensor'
  | 'Processor'
  | 'Harvester'
  | 'Assembler'
  | 'Disassembler'
  | 'Charger'
  | 'MemoryCore'
  | 'Register';

// ============================================================
// Items = all craftable/harvestable things
// ============================================================
export type Item = RawMaterial | ProcessedMaterial | ComponentType;

// ============================================================
// Inventory — item name → count (mutable)
// ============================================================
export type Inventory = Record<string, number>;

// ============================================================
// Position (mutable)
// ============================================================
export interface Position {
  x: number;
  y: number;
}

// ============================================================
// Velocity (mutable)
// ============================================================
export interface Velocity {
  vx: number;
  vy: number;
}

// ============================================================
// Force vector
// ============================================================
export interface Force {
  fx: number;
  fy: number;
}

// ============================================================
// Resource node on the map
// ============================================================
export type ResourceNodeType = 'OreNode' | 'CrystalNode';

export interface ResourceNode {
  id: string;
  position: Position;
  type: ResourceNodeType;
  remaining: number;
  createdAt: number;
}

// ============================================================
// Energy node
// ============================================================
export interface EnergyNode {
  id: string;
  position: Position;
  productionRate: number;
  stored: number;
  maxStored: number;
  createdAt: number;
}

// ============================================================
// Remains — left behind when a character dies
// ============================================================
export interface Remains {
  id: string;
  position: Position;
  components: ComponentType[];
  inventory: Inventory;
  createdAt: number;
}

// ============================================================
// Ground grid — tracks absorbed materials per cell
// ============================================================
export interface GroundCell {
  ore: number;
  crystal: number;
}

export type GroundGrid = GroundCell[];

// ============================================================
// Condition (Program DSL)
// ============================================================
export type NearbyTargetType =
  | 'OreNode'
  | 'CrystalNode'
  | 'EnergyNode'
  | 'Character'
  | 'InactiveCharacter'
  | 'Remains';

export type Condition =
  | { op: 'true' }
  | { op: 'inventory_has'; item: string; count: number }
  | { op: 'nearby'; type: NearbyTargetType; radius: number }
  | { op: 'durability_below'; threshold: number }
  | { op: 'energy_below'; threshold: number }
  | { op: 'register_equals'; index: number; value: number | null }
  | { op: 'register_less_than'; index: number; value: number }
  | { op: 'register_greater_than'; index: number; value: number }
  | { op: 'and'; conditions: Condition[] }
  | { op: 'or'; conditions: Condition[] }
  | { op: 'not'; condition: Condition };

// ============================================================
// Action (Program DSL)
// ============================================================
export type MoveDirection = number | { register: number };

export type Action =
  | { op: 'NOOP' }
  | { op: 'MOVE'; direction: MoveDirection }
  | { op: 'HARVEST' }
  | { op: 'RECHARGE' }
  | { op: 'PROCESS'; recipe: ProcessedMaterial }
  | { op: 'CRAFT'; component: ComponentType }
  | { op: 'ASSEMBLE'; components: ComponentType[] }
  | { op: 'WRITE'; target: string }
  | { op: 'ACTIVATE'; target: string }
  | { op: 'SENSE' }
  | { op: 'REPAIR' }
  | { op: 'DISASSEMBLE' };

// ============================================================
// Register fn values
// ============================================================
export type FnValue =
  | { fn: 'angle_to_nearest'; type: NearbyTargetType }
  | { fn: 'angle_away_from_nearest'; type: NearbyTargetType }
  | { fn: 'wander_angle' };

export type RegisterValue = number | null | FnValue;

export interface SetRegister {
  index: number;
  value: RegisterValue;
}

// ============================================================
// Rule & Program
// ============================================================
export interface Rule {
  condition: Condition;
  set_registers?: SetRegister[];
  action: Action;
}

export interface Program {
  name?: string;
  rules: Rule[];
}

// ============================================================
// Sense data
// ============================================================
export interface SenseData {
  nearestByType: Partial<Record<NearbyTargetType, {
    relativePosition: Position;
  }>>;
}

// ============================================================
// Character (mutable)
// ============================================================
export interface Character {
  id: string;
  species: string;
  position: Position;
  velocity: Velocity;
  components: ComponentType[];
  inventory: Inventory;
  durability: number;
  energy: number;
  program: Program | null;
  senseData: SenseData | null;
  registers: (number | null)[];
  createdAt: number;
}

// ============================================================
// World (mutable)
// ============================================================
export interface World {
  width: number;
  height: number;
  resourceNodes: ResourceNode[];
  energyNodes: EnergyNode[];
  remains: Remains[];
  characters: Character[];
  groundGrid: GroundGrid;
  nextCharacterId: number;
  nextObjectId: number;
  tick: number;
}

// ============================================================
// Simulation event
// ============================================================
export type SimulationEvent =
  | { type: 'character_spawned'; parentId: string; childId: string }
  | { type: 'character_died'; id: string };

// ============================================================
// Tick result (world is mutated in place)
// ============================================================
export interface TickResult {
  world: World;
  events: SimulationEvent[];
  actions: Map<string, Action>;
}

// ============================================================
// Action result (internal)
// ============================================================
export interface ActionResult {
  world: World;
  characterId: string;
  action: Action;
  success: boolean;
  events: SimulationEvent[];
}

// ============================================================
// Recipes
// ============================================================
export interface ProcessRecipe {
  output: ProcessedMaterial;
  inputs: Record<string, number>;
}

export interface CraftRecipe {
  output: ComponentType;
  inputs: Record<string, number>;
}
