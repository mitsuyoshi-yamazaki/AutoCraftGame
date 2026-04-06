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
  | 'WRITE' | 'ACTIVATE' | 'SENSE'
  | 'REPAIR' | 'DISASSEMBLE';

export interface ActionRecord {
  readonly op: ActionOp;
  readonly success: boolean;
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

// === Program definition (for loading initial programs) ===
export interface ProgramDefinition {
  readonly name: string;
  readonly components: readonly ComponentType[];
  readonly program: readonly number[];
  readonly count?: number;
}
