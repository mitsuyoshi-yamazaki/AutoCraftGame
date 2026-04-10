// === Materials ===
export type RawMaterial = 'Ore' | 'Crystal';
export type ProcessedMaterial = 'Metal' | 'Circuit';
export type ComponentType =
  | 'Frame' | 'Actuator' | 'Sensor' | 'Processor'
  | 'Harvester' | 'Assembler' | 'Disassembler'
  | 'Charger' | 'MemoryCore';
export type Item = RawMaterial | ProcessedMaterial | ComponentType;
export type Inventory = Readonly<Record<string, number>>;

// === Geometry ===
export interface Position { readonly x: number; readonly y: number }
export interface Velocity { readonly vx: number; readonly vy: number }
export interface Force { readonly fx: number; readonly fy: number }

// === World Objects ===
export type ResourceNodeType = 'OreNode' | 'CrystalNode';

export interface ResourceNode {
  readonly id: string;
  readonly position: Position;
  readonly type: ResourceNodeType;
  readonly remaining: number;
  readonly createdAt: number;
}

export interface EnergyNode {
  readonly id: string;
  readonly position: Position;
  readonly productionRate: number;
  readonly stored: number;
  readonly maxStored: number;
  readonly createdAt: number;
}

export interface Remains {
  readonly id: string;
  readonly position: Position;
  readonly components: readonly ComponentType[];
  readonly inventory: Inventory;
  readonly createdAt: number;
}

export interface GroundCell { readonly ore: number; readonly crystal: number }
export type GroundGrid = readonly GroundCell[];

// === VM State ===
export interface VmState {
  readonly memory: readonly number[];
  readonly registers: readonly number[];  // r0-r7 (r0 always 0)
  readonly pc: number;
  readonly cp: number;        // Checkpoint register (last CHECKPOINT target)
  readonly cpSet: boolean;    // true if CHECKPOINT has been executed at least once
  readonly active: boolean;
  readonly localIdTable: ReadonlyMap<number, string>;
  readonly localIdCounter: number;
}

// === Character ===
export interface Character {
  readonly id: string;
  readonly species: string;
  readonly position: Position;
  readonly velocity: Velocity;
  readonly components: readonly ComponentType[];
  readonly inventory: Inventory;
  readonly durability: number;
  readonly energy: number;
  readonly createdAt: number;
  readonly vm: VmState;
  // Primitive control layer (v6) — used when Processor is absent
  readonly primitiveRules: readonly PrimitiveRule[];
  readonly assemblyTemplates: readonly AssemblyTemplate[];
  // M3 (apoptosis) counters — incremented per tick by simulation step 8.5
  readonly idleTickCount: number;        // consecutive ticks with no action reservation
  readonly instrLimitTickCount: number;  // consecutive ticks hitting instructionsPerTick limit
}

// === World ===
export interface World {
  readonly width: number;
  readonly height: number;
  readonly resourceNodes: readonly ResourceNode[];
  readonly energyNodes: readonly EnergyNode[];
  readonly remains: readonly Remains[];
  readonly characters: readonly Character[];
  readonly groundGrid: GroundGrid;
  readonly nextCharacterId: number;
  readonly nextObjectId: number;
  readonly tick: number;
}

// === Actions (for tracking/display) ===
export type ActionOp =
  | 'MOVE' | 'HARVEST' | 'RECHARGE'
  | 'PROCESS' | 'CRAFT' | 'ASSEMBLE'
  | 'WRITE' | 'CROSS_WRITE' | 'ACTIVATE' | 'SENSE'
  | 'REPAIR' | 'DISASSEMBLE';

export type ActionFailureReason =
  | 'INSUFFICIENT_ENERGY'
  | 'MISSING_COMPONENT'
  | 'INVALID_TARGET'
  | 'TARGET_NOT_FOUND'
  | 'OUT_OF_RANGE'
  | 'MISSING_ITEMS'
  | 'INVALID_RECIPE'
  | 'NO_SPAWN_POSITION'
  | 'TARGET_ALREADY_ACTIVE'
  | 'EMPTY_REMAINS';

export interface ActionRecord {
  readonly op: ActionOp;
  readonly success: boolean;
  readonly reason?: ActionFailureReason;
}

// === Events ===
export type SimulationEvent =
  | { readonly type: 'character_spawned'; readonly parentId: string; readonly childId: string }
  | { readonly type: 'character_died'; readonly id: string };

// === Tick Result ===
export interface TickResult {
  readonly world: World;
  readonly events: readonly SimulationEvent[];
  readonly actions: ReadonlyMap<string, readonly ActionRecord[]>;
  readonly instructionLimitHits: ReadonlySet<string>;
  readonly checkpointHits: ReadonlySet<string>;  // Characters that executed CHECKPOINT this tick
  readonly reflexHits: ReadonlySet<string>;       // Characters whose reflex fired this tick
  readonly apoptosisDeaths: ReadonlySet<string>;  // Characters that died via apoptosis this tick
}

// === Recipes ===
export interface ProcessRecipe {
  readonly output: ProcessedMaterial;
  readonly inputs: Readonly<Record<string, number>>;
}

export interface CraftRecipe {
  readonly output: ComponentType;
  readonly inputs: Readonly<Record<string, number>>;
}

// === Nearby target types for SENSE ===
export type NearbyTargetType =
  | 'OreNode' | 'CrystalNode' | 'EnergyNode'
  | 'Character' | 'InactiveCharacter' | 'Remains';

// === Primitive Control Layer (v6) ===

export type PrimitiveConditionType =
  | 'always'
  | 'energy_below' | 'energy_above'
  | 'durability_below'
  | 'inventory_has' | 'inventory_below'
  | 'nearby' | 'not_nearby'
  | 'tick_mod'
  | 'can_assemble'
  | 'can_craft'
  | 'can_craft_missing'
  | 'can_process'
  | 'and' | 'or' | 'not';

export type PrimitiveActionType =
  | 'move_toward' | 'move_away' | 'move_random'
  | 'harvest' | 'recharge'
  | 'process' | 'craft'
  | 'assemble' | 'repair' | 'disassemble'
  | 'noop';

export interface PrimitiveCondition {
  readonly type: PrimitiveConditionType;
  readonly arg0: number;  // interpretation depends on type
  readonly arg1: number;
  readonly sub?: readonly PrimitiveCondition[];  // for and/or/not combinators
}

export interface PrimitiveAction {
  readonly type: PrimitiveActionType;
  readonly arg0: number;
  readonly arg1: number;
}

export interface PrimitiveRule {
  readonly condition: PrimitiveCondition;
  readonly action: PrimitiveAction;
}

export interface AssemblyTemplate {
  readonly components: readonly ComponentType[];
  readonly rules: readonly PrimitiveRule[];
  readonly templates: readonly AssemblyTemplate[];
}

// === Character (updated with primitives) ===
// Character type now includes optional primitive fields.
// See Character interface above — primitiveRules and assemblyTemplates
// are added there.

// === Program definition (for loading initial programs) ===
export interface ProgramDefinition {
  readonly name: string;
  readonly components: readonly ComponentType[];
  readonly program: readonly number[];
  readonly count?: number;
}

// === Primitive definition (for loading primitive-based characters) ===
export interface PrimitiveDefinition {
  readonly name: string;
  readonly components: readonly ComponentType[];
  readonly rules: readonly PrimitiveRule[];
  readonly templates: readonly AssemblyTemplate[];
  readonly count?: number;
}
