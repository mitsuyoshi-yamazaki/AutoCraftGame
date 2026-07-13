import type { Substance } from './types';

/**
 * 全物質の定義。
 * 仕様: docs/plan/craft_tree/spec_draft.md
 *
 * naturalAbundance を持つ物質のみ自然産出する（資源ノード等）。
 * X原子は自然産出する不純資源 ContaminatedMass によってのみ世界に入る
 * （原子保存則の下では、Xを含まない入力からXを生成するレシピは定義できないため）。
 */

const BASE: readonly Substance[] = [
  // 構造系
  {
    id: 'BaseSolid',
    tier: 'base',
    category: 'structure',
    composition: { S: 2 },
    naturalAbundance: 'abundant',
    description: '最も基本的な安定物質',
  },
  {
    id: 'DenseMatrix',
    tier: 'base',
    category: 'structure',
    composition: { S: 3 },
    description: '高安定・低反応性',
  },
  {
    id: 'BindingShard',
    tier: 'base',
    category: 'structure',
    composition: { S: 1, B: 1 },
    naturalAbundance: 'common',
    description: '基本的な接続素材',
  },
  {
    id: 'FlexibleChain',
    tier: 'base',
    category: 'structure',
    composition: { S: 1, B: 2 },
    description: '結合性が高いがやや不安定',
  },
  // 活性系
  {
    id: 'ReactiveFragment',
    tier: 'base',
    category: 'active',
    composition: { S: 1, A: 1 },
    description: '最も基本的な活性物質',
  },
  {
    id: 'VolatileCore',
    tier: 'base',
    category: 'active',
    composition: { A: 2 },
    naturalAbundance: 'limited',
    description: '非常に不安定・分解しやすい。分解時にエネルギーを放出する',
  },
  {
    id: 'ChargedBinder',
    tier: 'base',
    category: 'active',
    composition: { B: 1, A: 1 },
    description: '結合しながら反応を起こす',
  },
  // 伝達系
  {
    id: 'SignalFluid',
    tier: 'base',
    category: 'transfer',
    composition: { T: 2 },
    naturalAbundance: 'limited',
    description: '流動性・伝達性',
  },
  {
    id: 'ConductiveGel',
    tier: 'base',
    category: 'transfer',
    composition: { S: 1, T: 1 },
    description: '構造＋伝達',
  },
  // 情報系
  {
    id: 'InfoSeed',
    tier: 'base',
    category: 'information',
    composition: { I: 1 },
    naturalAbundance: 'rare',
    description: '最小の情報単位（非常に不安定）',
  },
  {
    id: 'EncodedFragment',
    tier: 'base',
    category: 'information',
    composition: { S: 1, I: 1 },
    description: '安定化された情報',
  },
  {
    id: 'PatternChain',
    tier: 'base',
    category: 'information',
    composition: { B: 1, I: 1 },
    description: '結合可能な情報構造',
  },
  // 触媒系
  {
    id: 'CatalystGrain',
    tier: 'base',
    category: 'catalyst',
    composition: { C: 1 },
    naturalAbundance: 'rare',
    description: '単純触媒',
  },
  {
    id: 'ActiveCatalyst',
    tier: 'base',
    category: 'catalyst',
    composition: { C: 1, A: 1 },
    description: '反応促進能力が高い',
  },
  // 不純物系
  {
    id: 'Residue',
    tier: 'base',
    category: 'waste',
    composition: { X: 1 },
    description: '低機能・安定・蓄積しやすい。消滅させることはできず、ContaminatedMassとの間で固定/分離を繰り返す',
  },
];

const INTERMEDIATE: readonly Substance[] = [
  // 構造強化系
  {
    id: 'ReinforcedMatrix',
    tier: 'intermediate',
    category: 'structure',
    composition: { S: 3, B: 1 },
    description: '高安定構造基盤',
  },
  {
    id: 'ElasticFramework',
    tier: 'intermediate',
    category: 'structure',
    composition: { S: 2, B: 2 },
    description: '可変構造',
  },
  // 活性統合系
  {
    id: 'ReactiveCluster',
    tier: 'intermediate',
    category: 'active',
    composition: { S: 1, A: 2 },
    description: '高反応性塊',
  },
  {
    id: 'StabilizedReactor',
    tier: 'intermediate',
    category: 'active',
    composition: { S: 2, A: 1, B: 1 },
    description: '制御された反応媒体',
  },
  // 伝達・運動系
  {
    id: 'SignalMatrix',
    tier: 'intermediate',
    category: 'transfer',
    composition: { S: 2, T: 2 },
    description: '伝達ネットワーク',
  },
  {
    id: 'ActiveConductor',
    tier: 'intermediate',
    category: 'transfer',
    composition: { S: 1, T: 1, A: 1 },
    description: 'エネルギー＋信号伝達',
  },
  // 情報集約系
  {
    id: 'DataLattice',
    tier: 'intermediate',
    category: 'information',
    composition: { S: 2, I: 2 },
    description: '安定な情報保存',
  },
  {
    id: 'LogicFilament',
    tier: 'intermediate',
    category: 'information',
    composition: { B: 1, I: 2 },
    description: '演算的構造',
  },
  {
    id: 'EncodedMatrix',
    tier: 'intermediate',
    category: 'information',
    composition: { S: 2, B: 1, I: 1 },
    description: '構造＋情報の統合',
  },
  // 触媒高度化
  {
    id: 'CatalystMatrix',
    tier: 'intermediate',
    category: 'catalyst',
    composition: { S: 1, C: 1, B: 1 },
    description: '安定触媒基盤',
  },
  {
    id: 'HyperCatalyst',
    tier: 'intermediate',
    category: 'catalyst',
    composition: { C: 1, A: 2 },
    description: '強力だが不安定',
  },
  // 廃棄物混入系
  {
    id: 'ContaminatedMass',
    tier: 'intermediate',
    category: 'waste',
    composition: { S: 2, X: 1 },
    naturalAbundance: 'abundant',
    description: '不純物を含む低品位素材。自然産出し、X原子が世界に入る唯一の経路。精製すると BaseSolid と Residue に分離できる',
  },
];

/**
 * コンポーネント。
 * 原子構成はコンポーネントの機能と原子の役割が対応するよう設計されている。
 * - 情報処理系(Processor/MemoryCore/Sensor)はI原子を要求（希少資源ボトルネック）
 * - 反応系(Assembler/Disassembler)はA+C原子を要求
 * - 運動系(Actuator/Harvester)はT+A原子を要求
 * - Storageは構造S原子のみ
 */
const COMPONENTS: readonly Substance[] = [
  {
    id: 'Assembler',
    tier: 'component',
    category: 'component',
    composition: { S: 3, A: 1, B: 2, C: 1 },
    description: '物質の合成（レシピ実行）を行う',
  },
  {
    id: 'Disassembler',
    tier: 'component',
    category: 'component',
    composition: { S: 2, A: 3, B: 1, C: 1 },
    description: '死骸や他コンポーネントの分解を行う。Assemblerより活性原子が多い',
  },
  {
    id: 'Processor',
    tier: 'component',
    category: 'component',
    composition: { S: 2, B: 1, I: 4 },
    description: 'プログラムを実行する。最も情報原子を要求する',
  },
  {
    id: 'MemoryCore',
    tier: 'component',
    category: 'component',
    composition: { S: 4, B: 1, I: 3 },
    description: '追加のプログラム/データ格納領域',
  },
  {
    id: 'Actuator',
    tier: 'component',
    category: 'component',
    composition: { S: 3, A: 1, B: 2, T: 1 },
    description: '移動の推進力を発生する',
  },
  {
    id: 'Sensor',
    tier: 'component',
    category: 'component',
    composition: { S: 2, B: 1, I: 1, T: 2 },
    description: '周囲のオブジェクトを探知する',
  },
  {
    id: 'Harvester',
    tier: 'component',
    category: 'component',
    composition: { S: 3, A: 1, B: 1, T: 1 },
    description: '周囲の資源・エネルギーを回収する',
  },
  {
    id: 'Storage',
    tier: 'component',
    category: 'component',
    composition: { S: 6, B: 1 },
    description: '資源とエネルギーを格納する。構造原子のみで構成される',
  },
];

export const SUBSTANCES: readonly Substance[] = [...BASE, ...INTERMEDIATE, ...COMPONENTS];

export const SUBSTANCE_MAP: ReadonlyMap<string, Substance> = new Map(
  SUBSTANCES.map(substance => [substance.id, substance]),
);

export const NATURAL_SOURCES: readonly Substance[] = SUBSTANCES.filter(
  substance => substance.naturalAbundance !== undefined,
);

/**
 * 物質コード: データ定義順の1始まり連番。
 * I/Oの種別コード（100+コード）とStorageの在庫照会で使用する（docs/specs/03_program_io.md）。
 */
export const SUBSTANCE_CODES: ReadonlyMap<string, number> = new Map(
  SUBSTANCES.map((substance, index) => [substance.id, index + 1]),
);
