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
  | 'MemoryCore';

// ============================================================
// Items = all craftable/harvestable things
// ============================================================
export type Item = RawMaterial | ProcessedMaterial | ComponentType;

// ============================================================
// Inventory — item name → count
// ============================================================
export type Inventory = Readonly<Record<string, number>>;

// ============================================================
// Direction
// ============================================================
export type Direction = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

// ============================================================
// Position
// ============================================================
export interface Position {
  readonly x: number;
  readonly y: number;
}

// ============================================================
// Resource node on the map (v2: finite remaining)
// ============================================================
export type ResourceNodeType = 'OreNode' | 'CrystalNode';

export interface ResourceNode {
  readonly position: Position;
  readonly type: ResourceNodeType;
  readonly remaining: number;
}

// ============================================================
// Energy node (v2: new)
// ============================================================
export interface EnergyNode {
  readonly position: Position;
  readonly productionRate: number;
  readonly stored: number;
  readonly maxStored: number;
}

// ============================================================
// Remains — left behind when a character dies (v2: new)
// ============================================================
export interface Remains {
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
  | { readonly op: 'and'; readonly conditions: readonly Condition[] }
  | { readonly op: 'or'; readonly conditions: readonly Condition[] }
  | { readonly op: 'not'; readonly condition: Condition };

// ============================================================
// Action (Program DSL)
// ============================================================
export type Action =
  | { readonly op: 'NOOP' }
  | { readonly op: 'MOVE'; readonly direction: Direction | 'toward_nearest' }
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
// Rule & Program
// ============================================================
export interface Rule {
  readonly condition: Condition;
  readonly action: Action;
}

export interface Program {
  readonly rules: readonly Rule[];
}

// ============================================================
// Sense data — output of SENSE action
// ============================================================
export interface SenseData {
  readonly nearestByType: Readonly<Partial<Record<NearbyTargetType, { position: Position; direction: Direction }>>>;
}

// ============================================================
// Character (v2: energy field added)
// ============================================================
export interface Character {
  readonly id: string;
  readonly position: Position;
  readonly components: readonly ComponentType[];
  readonly inventory: Inventory;
  readonly durability: number;
  readonly energy: number;
  readonly program: Program | null;
  readonly senseData: SenseData | null;
}

// ============================================================
// World (v2: energyNodes, remains added)
// ============================================================
export interface World {
  readonly width: number;
  readonly height: number;
  readonly resourceNodes: readonly ResourceNode[];
  readonly energyNodes: readonly EnergyNode[];
  readonly remains: readonly Remains[];
  readonly characters: readonly Character[];
  readonly nextCharacterId: number;
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
