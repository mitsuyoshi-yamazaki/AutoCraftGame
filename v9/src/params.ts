/**
 * ゲームパラメータ。値の意味は docs/specs/05_parameters.md を参照。
 * すべて暫定値であり、実測により調整される。
 */

export interface GameParams {
  // ワールド
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly proximityRange: number;
  readonly scanRange: number;
  readonly scanMaxResults: number;
  // VM
  readonly instructionsPerTick: number;
  readonly pmemWords: number;
  readonly memcoreWords: number;
  readonly procTickCost: number;
  // 物理
  readonly componentRadius: number;
  readonly frictionCoefficient: number;
  readonly collisionStiffness: number;
  readonly velocityClampThreshold: number;
  readonly massPerAtom: number;
  readonly maxSpeed: number;
  readonly thrustForceUnit: number;
  readonly thrustMax: number;
  readonly thrustEnergyDivisor: number;
  // 耐久度・修理
  readonly maxDurability: number;
  readonly ageInterval: number;
  readonly continuousWearInterval: number;
  readonly repairBaseEnergy: number;
  readonly repairAmount: number;
  // Assembler
  readonly reconfigEnergy: number;
  readonly reconfigTicks: number;
  readonly craftTicksBase: number;
  readonly craftTicksIntermediate: number;
  readonly craftTicksComponent: number;
  readonly spawnOffset: number;
  // Harvester / Disassembler
  readonly harvestMatterRate: number;
  readonly harvestEnergyRate: number;
  readonly harvestActionCost: number;
  readonly disassembleTicks: number;
  readonly disassembleActionCost: number;
  // Sensor / Storage / その他アクション
  readonly scanEnergy: number;
  readonly cscanEnergy: number;
  readonly transferEnergy: number;
  readonly matterCapacity: number;
  readonly energyCapacity: number;
  // 資源ノード
  readonly energyNodeCount: number;
  readonly energyNodeFlow: number;
  readonly nodeCountByAbundance: Readonly<Record<string, number>>;
  readonly nodeAmountByAbundance: Readonly<Record<string, number>>;
  // 自発変化
  readonly decayProbability: number;
}

export const DEFAULT_GAME_PARAMS: GameParams = {
  worldWidth: 100,
  worldHeight: 100,
  proximityRange: 3.0,
  scanRange: 10.0,
  scanMaxResults: 8,

  instructionsPerTick: 10000,
  // 4096語。定住型複製子は約620語で足りたが、移動＋探索採取＋6部品の子を持つ移動複製子は
  // 約1400語を要し1024語では不足した（docs/experiments/06参照）。16bitアドレス空間の範囲で拡大。
  pmemWords: 4096,
  memcoreWords: 4096,
  procTickCost: 1,

  componentRadius: 0.4,
  frictionCoefficient: 0.8,
  collisionStiffness: 200.0,
  velocityClampThreshold: 0.01,
  massPerAtom: 1,
  maxSpeed: 1.0,
  thrustForceUnit: 1.0,
  thrustMax: 255,
  thrustEnergyDivisor: 16,

  maxDurability: 1000,
  ageInterval: 10,
  continuousWearInterval: 10,
  repairBaseEnergy: 40,
  repairAmount: 400,

  reconfigEnergy: 30,
  reconfigTicks: 5,
  craftTicksBase: 5,
  craftTicksIntermediate: 10,
  craftTicksComponent: 30,
  // 親（4コンポーネント、半径0.8）と重ならない距離。重なり反発で親が押し流されるのを防ぐ
  spawnOffset: 2.0,

  harvestMatterRate: 1,
  harvestEnergyRate: 40,
  harvestActionCost: 2,
  disassembleTicks: 15,
  disassembleActionCost: 15,

  scanEnergy: 5,
  cscanEnergy: 1,
  transferEnergy: 1,
  matterCapacity: 200,
  energyCapacity: 2000,

  energyNodeCount: 30,
  energyNodeFlow: 100,
  nodeCountByAbundance: { abundant: 40, common: 20, limited: 12, rare: 6 },
  nodeAmountByAbundance: { abundant: 400, common: 200, limited: 100, rare: 40 },

  decayProbability: 1 / 2000,
};
