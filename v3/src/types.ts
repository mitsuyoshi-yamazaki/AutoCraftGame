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
// Inventory — item name → count
// ============================================================
export type Inventory = Readonly<Record<string, number>>;

// ============================================================
// Position (v3: continuous floating-point coordinates)
// ============================================================
export interface Position {
  readonly x: number;
  readonly y: number;
}

// ============================================================
// Velocity (v3: new)
// ============================================================
export interface Velocity {
  readonly vx: number;
  readonly vy: number;
}

// ============================================================
// Force vector (v3: new, used internally in physics)
// ============================================================
export interface Force {
  readonly fx: number;
  readonly fy: number;
}

// ============================================================
// Resource node on the map
// ============================================================
export type ResourceNodeType = 'OreNode' | 'CrystalNode';

export interface ResourceNode {
  readonly id: string;
  readonly position: Position;
  readonly type: ResourceNodeType;
  readonly remaining: number;
}

// ============================================================
// Energy node
// ============================================================
export interface EnergyNode {
  readonly id: string;
  readonly position: Position;
  readonly productionRate: number;
  readonly stored: number;
  readonly maxStored: number;
}

// ============================================================
// Remains — left behind when a character dies
// ============================================================
export interface Remains {
  readonly id: string;
  readonly position: Position;
  readonly components: readonly ComponentType[];
  readonly inventory: Inventory;
}

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
  | { readonly op: 'true' }
  | { readonly op: 'inventory_has'; readonly item: string; readonly count: number }
  | { readonly op: 'nearby'; readonly type: NearbyTargetType; readonly radius: number }
  | { readonly op: 'durability_below'; readonly threshold: number }
  | { readonly op: 'energy_below'; readonly threshold: number }
  | { readonly op: 'register_equals'; readonly index: number; readonly value: number | null }
  | { readonly op: 'register_less_than'; readonly index: number; readonly value: number }
  | { readonly op: 'register_greater_than'; readonly index: number; readonly value: number }
  | { readonly op: 'and'; readonly conditions: readonly Condition[] }
  | { readonly op: 'or'; readonly conditions: readonly Condition[] }
  | { readonly op: 'not'; readonly condition: Condition };

// ============================================================
// Action (Program DSL) — v3: MOVE uses degrees or register reference
// ============================================================
export type MoveDirection = number | { readonly register: number };

export type Action =
  | { readonly op: 'NOOP' }
  | { readonly op: 'MOVE'; readonly direction: MoveDirection }
  | { readonly op: 'HARVEST' }
  | { readonly op: 'RECHARGE' }
  | { readonly op: 'PROCESS'; readonly recipe: ProcessedMaterial }
  | { readonly op: 'CRAFT'; readonly component: ComponentType }
  | { readonly op: 'ASSEMBLE'; readonly components: readonly ComponentType[] }
  | { readonly op: 'WRITE'; readonly target: string }
  | { readonly op: 'ACTIVATE'; readonly target: string }
  | { readonly op: 'SENSE' }
  | { readonly op: 'REPAIR' }
  | { readonly op: 'DISASSEMBLE' };

// ============================================================
// Register fn values (computed at rule evaluation time)
// ============================================================
export type FnValue =
  | { readonly fn: 'angle_to_nearest'; readonly type: NearbyTargetType }
  | { readonly fn: 'angle_away_from_nearest'; readonly type: NearbyTargetType }
  | { readonly fn: 'wander_angle' };

export type RegisterValue = number | null | FnValue;

export interface SetRegister {
  readonly index: number;
  readonly value: RegisterValue;
}

// ============================================================
// Rule & Program
// ============================================================
export interface Rule {
  readonly condition: Condition;
  readonly set_registers?: readonly SetRegister[];
  readonly action: Action;
}

export interface Program {
  readonly name?: string;
  readonly rules: readonly Rule[];
}

// ============================================================
// Sense data — v3: relative position instead of direction
// ============================================================
export interface SenseData {
  readonly nearestByType: Readonly<Partial<Record<NearbyTargetType, {
    relativePosition: Position;
  }>>>;
}

// ============================================================
// Character (v3: velocity added)
// ============================================================
export interface Character {
  readonly id: string;
  readonly species: string;
  readonly position: Position;
  readonly velocity: Velocity;
  readonly components: readonly ComponentType[];
  readonly inventory: Inventory;
  readonly durability: number;
  readonly energy: number;
  readonly program: Program | null;
  readonly senseData: SenseData | null;
  readonly registers: readonly (number | null)[];
}

// ============================================================
// World (v3: continuous space, no grid width/height as integers)
// ============================================================
export interface World {
  readonly width: number;
  readonly height: number;
  readonly resourceNodes: readonly ResourceNode[];
  readonly energyNodes: readonly EnergyNode[];
  readonly remains: readonly Remains[];
  readonly characters: readonly Character[];
  readonly nextCharacterId: number;
  readonly nextObjectId: number;
  readonly tick: number;
}

// ============================================================
// Simulation event
// ============================================================
export type SimulationEvent =
  | { readonly type: 'character_spawned'; readonly parentId: string; readonly childId: string }
  | { readonly type: 'character_died'; readonly id: string };

// ============================================================
// Tick result
// ============================================================
export interface TickResult {
  readonly world: World;
  readonly events: readonly SimulationEvent[];
}

// ============================================================
// Action result (internal)
// ============================================================
export interface ActionResult {
  readonly world: World;
  readonly characterId: string;
  readonly action: Action;
  readonly success: boolean;
  readonly events: readonly SimulationEvent[];
}

// ============================================================
// Recipes
// ============================================================
export interface ProcessRecipe {
  readonly output: ProcessedMaterial;
  readonly inputs: Readonly<Record<string, number>>;
}

export interface CraftRecipe {
  readonly output: ComponentType;
  readonly inputs: Readonly<Record<string, number>>;
}
