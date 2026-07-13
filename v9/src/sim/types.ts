/**
 * ワールドオブジェクトモデル。仕様: docs/specs/00_world_objects.md, 02_components.md
 */

export type ComponentType =
  | 'Assembler'
  | 'Processor'
  | 'MemoryCore'
  | 'Actuator'
  | 'Sensor'
  | 'Harvester'
  | 'Disassembler'
  | 'Storage';

export const COMPONENT_TYPES: readonly ComponentType[] = [
  'Assembler',
  'Processor',
  'MemoryCore',
  'Actuator',
  'Sensor',
  'Harvester',
  'Disassembler',
  'Storage',
];

export interface Position {
  readonly x: number;
  readonly y: number;
}

export const EDGE_COUNT = 6;

/** 辺スロット: 長さ6、各要素は接続先コンポーネントID（未接続はnull） */
export type EdgeSlots = readonly (number | null)[];

export const emptyEdges = (): EdgeSlots => [null, null, null, null, null, null];

// === コンポーネント ===

interface ComponentBase {
  readonly id: number;
  readonly kind: 'component';
  readonly position: Position; // グループ所属時はローカル(0,0)、実効位置はグループ座標
  readonly velocity: Position; // 単独時のみ使用（グループ所属時はグループが持つ）
  readonly groupId: number | null;
  readonly edges: EdgeSlots;
  readonly durability: number; // 0で残骸（wreck）
  readonly repairCount: number;
  readonly opmem: readonly number[];
}

export interface AssemblerComponent extends ComponentBase {
  readonly componentType: 'Assembler';
  readonly configuredRecipe: number; // レシピコード。0=未構成
  readonly phase: 'idle' | 'reconfiguring' | 'crafting' | 'assembling';
  readonly ticksRemaining: number;
  readonly pendingRecipe: number; // reconfiguring中の切替先レシピコード
  readonly spawnCount: number; // 自由設置の回数（設置方位の回転に使う）
}

export interface ProcessorComponent extends ComponentBase {
  readonly componentType: 'Processor';
  readonly running: boolean;
  readonly memory: readonly number[];
  readonly registers: readonly number[];
  readonly pc: number;
  readonly localIdTable: ReadonlyMap<number, number>; // localId → objectId
  readonly localIdCounter: number;
  readonly ioRegisters: ProcessorIoRegisters;
}

export interface ProcessorIoRegisters {
  readonly opMemTargetId: number;
  readonly opMemOffset: number;
  readonly pmemTargetId: number;
  readonly pmemAddr: number;
}

export interface MemoryCoreComponent extends ComponentBase {
  readonly componentType: 'MemoryCore';
  readonly memory: readonly number[];
}

export interface StorageComponent extends ComponentBase {
  readonly componentType: 'Storage';
  readonly energy: number;
  /** 物質コード → 個数 */
  readonly items: ReadonlyMap<number, number>;
}

export interface DisassemblerComponent extends ComponentBase {
  readonly componentType: 'Disassembler';
  readonly ticksRemaining: number; // 0=idle
  readonly targetObjectId: number;
}

export interface SimpleComponent extends ComponentBase {
  readonly componentType: 'Actuator' | 'Sensor' | 'Harvester';
}

export type ComponentObject =
  | AssemblerComponent
  | ProcessorComponent
  | MemoryCoreComponent
  | StorageComponent
  | DisassemblerComponent
  | SimpleComponent;

/** 残骸判定。残骸は全機能停止だが物体・接続としては残存する */
export const isWreck = (component: ComponentObject): boolean => component.durability <= 0;

// === グループ ===

export interface GroupObject {
  readonly id: number;
  readonly kind: 'group';
  readonly position: Position;
  readonly velocity: Position;
  readonly memberIds: readonly number[];
}

// === 資源・地面 ===

export interface MatterNode {
  readonly id: number;
  readonly kind: 'matterNode';
  readonly position: Position;
  readonly substanceCode: number;
  readonly remaining: number;
}

export interface EnergyNode {
  readonly id: number;
  readonly kind: 'energyNode';
  readonly position: Position;
  readonly flowUsed: number; // 当tickの流出量（フェーズ0でリセット）
}

/** 散布された物質（Storageに入っていないもの） */
export interface GroundObject {
  readonly id: number;
  readonly kind: 'ground';
  readonly position: Position;
  readonly substanceCode: number;
  readonly count: number;
}

/** 散布されたエネルギー（Storage残骸の分解等で生じる） */
export interface EnergyPile {
  readonly id: number;
  readonly kind: 'energyPile';
  readonly position: Position;
  readonly amount: number;
}

export type WorldObject =
  | ComponentObject
  | GroupObject
  | MatterNode
  | EnergyNode
  | GroundObject
  | EnergyPile;

// === ワールド ===

export interface World {
  readonly width: number;
  readonly height: number;
  readonly objects: readonly WorldObject[];
  readonly nextObjectId: number;
  readonly tick: number;
}

// === イベント ===

export type SimulationEvent =
  | { readonly type: 'component_created'; readonly id: number; readonly componentType: ComponentType }
  | { readonly type: 'component_wrecked'; readonly id: number; readonly componentType: ComponentType }
  | { readonly type: 'component_removed'; readonly id: number; readonly componentType: ComponentType; readonly cause: 'disassembled' | 'decayed' }
  | { readonly type: 'craft_completed'; readonly assemblerId: number; readonly recipeCode: number }
  | { readonly type: 'processor_started'; readonly id: number };
