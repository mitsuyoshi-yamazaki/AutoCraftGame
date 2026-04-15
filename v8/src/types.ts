// === VM State (for vm/ compatibility) ===
export interface VmState {
  readonly memory: readonly number[];
  readonly registers: readonly number[];
  readonly pc: number;
  readonly cp: number;
  readonly cpSet: boolean;
  readonly active: boolean;
  readonly localIdTable: ReadonlyMap<number, number>;
  readonly localIdCounter: number;
}

// === Object Types ===
export type MaterialType = 'Ore' | 'Crystal' | 'Metal' | 'Circuit';
export type ComponentType = 'Assembler' | 'Processor';
export type ObjectKind = 'energy' | 'material' | 'assembler' | 'processor' | 'group';

// === Geometry ===
export interface Position { readonly x: number; readonly y: number }

// === Base Object ===
export interface WorldObjectBase {
  readonly id: number;
  readonly kind: ObjectKind;
  readonly position: Position;
  readonly orientation: number;
}

// === Energy Object ===
export interface EnergyObject extends WorldObjectBase {
  readonly kind: 'energy';
  readonly amount: number;
}

// === Material Object ===
export interface MaterialObject extends WorldObjectBase {
  readonly kind: 'material';
  readonly materialType: MaterialType;
  readonly amount: number;
}

// === Assembler opmem layout constants (v8) ===
export const ASSEMBLER_OPMEM_SIZE = 8;
export const ASM_OFF_ASSEMBLE_TRIGGER = 0;
export const ASM_OFF_RECIPE = 1;
export const ASM_OFF_CONNECTION_TARGET_ID = 2;
export const ASM_OFF_ASSEMBLE_STATUS = 3;
export const ASM_OFF_ASSEMBLE_PROGRESS = 4;
export const ASM_OFF_LAST_PRODUCT_ID = 5;
export const ASM_OFF_DISCONNECT_TRIGGER = 6;
export const ASM_OFF_DISCONNECT_TARGET_ID = 7;

// === Assembler State ===
export type AssemblerPhase = 'idle' | 'gathering' | 'assembling';

export interface AssemblerObject extends WorldObjectBase {
  readonly kind: 'assembler';
  readonly groupId: number | null;
  readonly operationMemory: readonly number[];  // ASSEMBLER_OPMEM_SIZE words
  readonly phase: AssemblerPhase;
  readonly recipe: number;
  readonly gatherProgress: Readonly<Record<string, number>>;
  readonly gatheredEnergy: number;
  readonly assembleTicksRemaining: number;
}

// === Processor opmem layout constants (v8) ===
export const PROCESSOR_OPMEM_SIZE = 73;
export const PROC_OFF_RUN_FLAG = 0;
export const PROC_OFF_SCAN_TRIGGER = 1;
export const PROC_OFF_SCAN_FILTER = 2;
export const PROC_OFF_SCAN_COUNT = 3;
export const PROC_OFF_SCAN_RESULTS = 4;   // 4..35 (8 entries * 4 words)
export const PROC_OFF_CSCAN_TRIGGER = 36;
export const PROC_OFF_CSCAN_FILTER = 37;
export const PROC_OFF_CSCAN_COUNT = 38;
export const PROC_OFF_CSCAN_RESULTS = 39; // 39..70
export const PROC_OFF_DISCONNECT_TRIGGER = 71;
export const PROC_OFF_DISCONNECT_TARGET_ID = 72;
export const SCAN_MAX_RESULTS = 8;
export const SCAN_ENTRY_WORDS = 4;

// === Processor State ===
export interface ProcessorObject extends WorldObjectBase {
  readonly kind: 'processor';
  readonly groupId: number | null;
  readonly operationMemory: readonly number[];  // PROCESSOR_OPMEM_SIZE words
  readonly running: boolean;
  readonly memory: readonly number[];     // 1024 words
  readonly registers: readonly number[];  // r0-r7
  readonly pc: number;
  readonly localIdTable: ReadonlyMap<number, number>;  // localId → canonical objectId
  readonly localIdCounter: number;
  readonly ioRegisters: ProcessorIoRegisters;
}

export interface ProcessorIoRegisters {
  readonly opMemTargetId: number;
  readonly opMemOffset: number;
  readonly pmemTargetId: number;
  readonly pmemAddr: number;
}

// === Group Object ===
export interface GroupObject extends WorldObjectBase {
  readonly kind: 'group';
  readonly memberIds: readonly number[];
  readonly edges: readonly (readonly [number, number])[];
}

// === Union Type ===
export type WorldObject =
  | EnergyObject
  | MaterialObject
  | AssemblerObject
  | ProcessorObject
  | GroupObject;

export type ComponentObject = AssemblerObject | ProcessorObject;

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
  readonly output: string;
  readonly outputKind: 'material' | 'assembler' | 'processor';
  readonly outputMaterialType?: MaterialType;
  readonly inputs: Readonly<Record<string, number>>;
  readonly energyCost: number;
  readonly assembleTicks: number;
}

// === Tick Result ===
export interface TickResult {
  readonly world: World;
  readonly events: readonly SimulationEvent[];
}

export type SimulationEvent =
  | { readonly type: 'object_created'; readonly id: number; readonly kind: ObjectKind }
  | { readonly type: 'object_destroyed'; readonly id: number }
  | { readonly type: 'assembler_started'; readonly id: number; readonly recipe: number }
  | { readonly type: 'assembler_completed'; readonly id: number; readonly productId: number }
  | { readonly type: 'disconnect_applied'; readonly actorId: number; readonly targetId: number }
  | { readonly type: 'group_split'; readonly originalId: number; readonly newId: number }
  | { readonly type: 'group_dissolved'; readonly id: number };
