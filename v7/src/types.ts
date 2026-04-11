// === VM State (for vm/ compatibility) ===
export interface VmState {
  readonly memory: readonly number[];
  readonly registers: readonly number[];
  readonly pc: number;
  readonly cp: number;
  readonly cpSet: boolean;
  readonly active: boolean;
  readonly localIdTable: ReadonlyMap<number, string>;
  readonly localIdCounter: number;
}

// === Object Types ===
export type MaterialType = 'Ore' | 'Crystal' | 'Metal' | 'Circuit';
export type ComponentType = 'Assembler' | 'Processor';
export type ObjectKind = 'energy' | 'material' | 'assembler' | 'processor';

// === Geometry ===
export interface Position { readonly x: number; readonly y: number }

// === Base Object ===
export interface WorldObjectBase {
  readonly id: string;
  readonly kind: ObjectKind;
  readonly position: Position;
  readonly orientation: number;  // degrees, 0 = right. Fixed at 0 for v7.0.0
}

// === Energy Object ===
export interface EnergyObject extends WorldObjectBase {
  readonly kind: 'energy';
  readonly amount: number;  // depletes as absorbed
}

// === Material Object ===
export interface MaterialObject extends WorldObjectBase {
  readonly kind: 'material';
  readonly materialType: MaterialType;
  readonly amount: number;  // depletes as absorbed
}

// === Assembler State ===
export type AssemblerPhase = 'idle' | 'gathering' | 'assembling';

export interface AssemblerObject extends WorldObjectBase {
  readonly kind: 'assembler';
  readonly operationMemory: readonly number[];  // fixed-length (5 words)
  // Internal state (derived from operation memory but tracked separately)
  readonly phase: AssemblerPhase;
  readonly recipe: number;               // 0 = unset, 1-4 = valid
  readonly gatherProgress: Readonly<Record<string, number>>;  // gathered amounts per material
  readonly gatheredEnergy: number;
  readonly assembleTicksRemaining: number;
}

// === Processor State ===
export interface ProcessorObject extends WorldObjectBase {
  readonly kind: 'processor';
  readonly operationMemory: readonly number[];  // fixed-length (37 words)
  readonly running: boolean;
  readonly memory: readonly number[];     // 1024 words (program + data)
  readonly registers: readonly number[];  // r0-r7
  readonly pc: number;
  // Persistent I/O state (survives across ticks)
  readonly localIdTable: ReadonlyMap<number, string>;  // localId → objectId
  readonly localIdCounter: number;
  readonly ioRegisters: ProcessorIoRegisters;
}

export interface ProcessorIoRegisters {
  readonly opMemTargetId: number;
  readonly opMemOffset: number;
  readonly pmemTargetId: number;
  readonly pmemAddr: number;
}

// === Union Type ===
export type WorldObject = EnergyObject | MaterialObject | AssemblerObject | ProcessorObject;

// === World ===
export interface World {
  readonly width: number;
  readonly height: number;
  readonly objects: readonly WorldObject[];
  readonly nextObjectId: number;
  readonly tick: number;
}

// === Recipe ===
export interface Recipe {
  readonly id: number;
  readonly output: string;              // object kind + type to produce
  readonly outputKind: 'material' | 'assembler' | 'processor';
  readonly outputMaterialType?: MaterialType;
  readonly inputs: Readonly<Record<string, number>>;  // materialType -> count
  readonly energyCost: number;
  readonly assembleTicks: number;
}

// === Tick Result ===
export interface TickResult {
  readonly world: World;
  readonly events: readonly SimulationEvent[];
}

export type SimulationEvent =
  | { readonly type: 'object_created'; readonly id: string; readonly kind: ObjectKind }
  | { readonly type: 'object_destroyed'; readonly id: string }
  | { readonly type: 'assembler_started'; readonly id: string; readonly recipe: number }
  | { readonly type: 'assembler_completed'; readonly id: string; readonly productId: string };
