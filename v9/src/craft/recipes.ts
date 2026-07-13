import type { ItemStack, Recipe } from './types';

/**
 * 全レシピの定義。
 * 仕様: docs/plan/craft_tree/spec_draft.md
 *
 * 設計原則:
 * - すべてのレシピで原子収支が一致する（test/craft-data.test.ts で機械検証）
 * - 出力は必ず定義済み物質（裸の原子を出力しない）
 * - 触媒は入力と出力の両方に同一物質として現れる（*c 系レシピ）
 * - ContaminatedMass を素材に使う dirty 系（RD*）は安価だが Residue を排出する
 * - エネルギーコストは暫定値。負値（放出）を含む閉じた循環の合計は必ず正
 *
 * 元ドラフト(git履歴の spec_draft.md 初版)からの主な変更は
 * docs/plan/craft_tree/design_notes.md を参照。
 */

const stack = (substanceId: string, count = 1): ItemStack => ({ substanceId, count });

const BASE_RECIPES: readonly Recipe[] = [
  {
    id: 'R1',
    kind: 'synthesis',
    inputs: [stack('BaseSolid'), stack('BindingShard', 2)],
    outputs: [stack('DenseMatrix'), stack('FlexibleChain')],
    energyCost: 15,
    summary: '構造の高密度化。副産物として柔軟鎖が生じる',
  },
  {
    id: 'R1c',
    kind: 'synthesis',
    inputs: [stack('BaseSolid'), stack('BindingShard', 2), stack('CatalystGrain')],
    outputs: [stack('DenseMatrix'), stack('FlexibleChain'), stack('CatalystGrain')],
    energyCost: 8,
    summary: 'R1の触媒版。触媒は消費されない',
  },
  {
    id: 'R2',
    kind: 'synthesis',
    inputs: [stack('BindingShard', 4)],
    outputs: [stack('FlexibleChain', 2), stack('BaseSolid')],
    energyCost: 10,
    summary: '接続素材から柔軟鎖を合成する',
  },
  {
    id: 'R4',
    kind: 'decomposition',
    inputs: [stack('BaseSolid'), stack('VolatileCore')],
    outputs: [stack('ReactiveFragment', 2)],
    energyCost: -10,
    summary: '活性コアで構造を割り、エネルギーを放出する（バッテリー用途）',
  },
  {
    id: 'R5',
    kind: 'rearrangement',
    inputs: [stack('ReactiveFragment'), stack('BindingShard')],
    outputs: [stack('ChargedBinder'), stack('BaseSolid')],
    energyCost: 5,
    summary: '活性を結合素材へ移す',
  },
  {
    id: 'R6',
    kind: 'synthesis',
    inputs: [stack('ChargedBinder'), stack('ReactiveFragment')],
    outputs: [stack('VolatileCore'), stack('BindingShard')],
    energyCost: 15,
    summary: '活性を濃縮し活性コアを再生する（A循環の閉路）',
  },
  {
    id: 'R7',
    kind: 'synthesis',
    inputs: [stack('BaseSolid'), stack('SignalFluid')],
    outputs: [stack('ConductiveGel', 2)],
    energyCost: 10,
    summary: '伝達流体を構造に定着させる',
  },
  {
    id: 'R8',
    kind: 'decomposition',
    inputs: [stack('ConductiveGel', 2)],
    outputs: [stack('BaseSolid'), stack('SignalFluid')],
    energyCost: 5,
    summary: 'ゲルから伝達流体を回収する（T循環の閉路）',
  },
  {
    id: 'R9',
    kind: 'synthesis',
    inputs: [stack('InfoSeed', 2), stack('BaseSolid')],
    outputs: [stack('EncodedFragment', 2)],
    energyCost: 20,
    summary: '情報を構造へ焼き付けて安定化する',
  },
  {
    id: 'R10',
    kind: 'rearrangement',
    inputs: [stack('EncodedFragment'), stack('BindingShard')],
    outputs: [stack('PatternChain'), stack('BaseSolid')],
    energyCost: 10,
    summary: '情報を結合可能な形へ再配置する',
  },
  {
    id: 'R11',
    kind: 'rearrangement',
    inputs: [stack('PatternChain'), stack('BaseSolid')],
    outputs: [stack('EncodedFragment'), stack('BindingShard')],
    energyCost: 10,
    summary: 'R10の逆変換',
  },
  {
    id: 'R12',
    kind: 'synthesis',
    inputs: [stack('CatalystGrain', 2), stack('ReactiveFragment', 2)],
    outputs: [stack('ActiveCatalyst', 2), stack('BaseSolid')],
    energyCost: 20,
    summary: '触媒に活性を付与する',
  },
  {
    id: 'R13',
    kind: 'decomposition',
    inputs: [stack('ActiveCatalyst', 2)],
    outputs: [stack('CatalystGrain', 2), stack('VolatileCore')],
    energyCost: -5,
    summary: '活性触媒の失活。少量のエネルギーを放出する（C循環の閉路）',
  },
  {
    id: 'R18',
    kind: 'rearrangement',
    inputs: [stack('FlexibleChain', 2), stack('BaseSolid')],
    outputs: [stack('BindingShard', 4)],
    energyCost: 10,
    summary: '柔軟鎖を接続素材へ戻す（B循環の閉路）',
  },
  {
    id: 'R19',
    kind: 'decomposition',
    inputs: [stack('DenseMatrix', 2), stack('VolatileCore')],
    outputs: [stack('ReactiveFragment', 2), stack('BaseSolid', 2)],
    energyCost: 5,
    summary: '高密度構造を活性で砕く（S循環の閉路）',
  },
  {
    id: 'R20',
    kind: 'decomposition',
    inputs: [stack('EncodedFragment', 2)],
    outputs: [stack('InfoSeed', 2), stack('BaseSolid')],
    energyCost: 25,
    summary: '情報構造から希少な情報原子を回収する（I循環の閉路）',
  },
];

const WASTE_RECIPES: readonly Recipe[] = [
  {
    id: 'R32',
    kind: 'synthesis',
    inputs: [stack('BaseSolid'), stack('Residue')],
    outputs: [stack('ContaminatedMass')],
    energyCost: 5,
    summary: '不純物を構造に固定する（安価な廃棄物処理）',
  },
  {
    id: 'R33',
    kind: 'refine',
    inputs: [stack('ContaminatedMass')],
    outputs: [stack('BaseSolid'), stack('Residue')],
    energyCost: 30,
    summary: '低品位素材の精製。清浄な構造材と不純物に分離する（高コスト）',
  },
  {
    id: 'RD1',
    kind: 'synthesis',
    inputs: [stack('ContaminatedMass'), stack('BindingShard', 2)],
    outputs: [stack('DenseMatrix'), stack('FlexibleChain'), stack('Residue')],
    energyCost: 10,
    summary: 'R1のdirty版。低品位素材を直接使うため安価だが不純物が残る',
  },
  {
    id: 'RD2',
    kind: 'synthesis',
    inputs: [stack('InfoSeed', 2), stack('ContaminatedMass')],
    outputs: [stack('EncodedFragment', 2), stack('Residue')],
    energyCost: 12,
    summary: 'R9のdirty版。安価だが不純物が残る',
  },
];

const INTERMEDIATE_RECIPES: readonly Recipe[] = [
  {
    id: 'R21',
    kind: 'synthesis',
    inputs: [stack('DenseMatrix', 2), stack('BindingShard', 2)],
    outputs: [stack('ReinforcedMatrix', 2), stack('BaseSolid')],
    energyCost: 25,
    summary: '高安定構造基盤の合成',
  },
  {
    id: 'R22',
    kind: 'synthesis',
    inputs: [stack('FlexibleChain', 2), stack('BaseSolid')],
    outputs: [stack('ElasticFramework'), stack('BindingShard', 2)],
    energyCost: 20,
    summary: '可変構造の合成',
  },
  {
    id: 'R23',
    kind: 'synthesis',
    inputs: [stack('ReactiveFragment', 2), stack('VolatileCore')],
    outputs: [stack('ReactiveCluster', 2)],
    energyCost: 20,
    summary: '高反応性塊の合成',
  },
  {
    id: 'R24',
    kind: 'synthesis',
    inputs: [stack('ReactiveCluster', 2), stack('BindingShard', 2)],
    outputs: [stack('StabilizedReactor', 2), stack('VolatileCore')],
    energyCost: 30,
    summary: '反応を制御構造に収める。余剰活性が活性コアとして回収される',
  },
  {
    id: 'R25',
    kind: 'synthesis',
    inputs: [stack('ConductiveGel', 2)],
    outputs: [stack('SignalMatrix')],
    energyCost: 20,
    summary: '伝達ネットワークの合成',
  },
  {
    id: 'R26',
    kind: 'synthesis',
    inputs: [stack('ReactiveFragment', 2), stack('ConductiveGel', 2)],
    outputs: [stack('ActiveConductor', 2), stack('BaseSolid')],
    energyCost: 25,
    summary: '活性伝達体の合成',
  },
  {
    id: 'R27',
    kind: 'synthesis',
    inputs: [stack('EncodedFragment', 2)],
    outputs: [stack('DataLattice')],
    energyCost: 30,
    summary: '安定情報格子の合成',
  },
  {
    id: 'R27c',
    kind: 'synthesis',
    inputs: [stack('EncodedFragment', 2), stack('ActiveCatalyst')],
    outputs: [stack('DataLattice'), stack('ActiveCatalyst')],
    energyCost: 15,
    summary: 'R27の触媒版。触媒は消費されない',
  },
  {
    id: 'R28',
    kind: 'synthesis',
    inputs: [stack('PatternChain'), stack('InfoSeed')],
    outputs: [stack('LogicFilament')],
    energyCost: 30,
    summary: '演算構造の合成',
  },
  {
    id: 'R29',
    kind: 'synthesis',
    inputs: [stack('EncodedFragment'), stack('BindingShard')],
    outputs: [stack('EncodedMatrix')],
    energyCost: 25,
    summary: '構造と情報の統合',
  },
  {
    id: 'R30',
    kind: 'synthesis',
    inputs: [stack('CatalystGrain'), stack('BindingShard')],
    outputs: [stack('CatalystMatrix')],
    energyCost: 25,
    summary: '安定触媒基盤の合成',
  },
  {
    id: 'R31',
    kind: 'synthesis',
    inputs: [stack('ActiveCatalyst', 2), stack('VolatileCore')],
    outputs: [stack('HyperCatalyst', 2)],
    energyCost: 30,
    summary: '強力だが不安定な触媒の合成',
  },
];

/** コンポーネント生成。中間物質2種を統合する形に統一 */
const COMPONENT_RECIPES: readonly Recipe[] = [
  {
    id: 'RC1',
    kind: 'component',
    inputs: [stack('DataLattice'), stack('LogicFilament')],
    outputs: [stack('Processor')],
    energyCost: 150,
    summary: '情報格子と演算構造からProcessorを組み上げる',
  },
  {
    id: 'RC2',
    kind: 'component',
    inputs: [stack('DataLattice'), stack('EncodedMatrix')],
    outputs: [stack('MemoryCore')],
    energyCost: 120,
    summary: '情報格子と統合構造からMemoryCoreを組み上げる',
  },
  {
    id: 'RC3',
    kind: 'component',
    inputs: [stack('StabilizedReactor'), stack('CatalystMatrix')],
    outputs: [stack('Assembler')],
    energyCost: 120,
    summary: '制御反応媒体と触媒基盤からAssemblerを組み上げる',
  },
  {
    id: 'RC4',
    kind: 'component',
    inputs: [stack('StabilizedReactor'), stack('HyperCatalyst')],
    outputs: [stack('Disassembler')],
    energyCost: 120,
    summary: '制御反応媒体と強触媒からDisassemblerを組み上げる',
  },
  {
    id: 'RC5',
    kind: 'component',
    inputs: [stack('ElasticFramework'), stack('ActiveConductor')],
    outputs: [stack('Actuator')],
    energyCost: 100,
    summary: '可変構造と活性伝達体からActuatorを組み上げる',
  },
  {
    id: 'RC6',
    kind: 'component',
    inputs: [stack('SignalMatrix'), stack('PatternChain')],
    outputs: [stack('Sensor')],
    energyCost: 100,
    summary: '伝達ネットワークとパターン構造からSensorを組み上げる',
  },
  {
    id: 'RC7',
    kind: 'component',
    inputs: [stack('StabilizedReactor'), stack('ConductiveGel')],
    outputs: [stack('Harvester')],
    energyCost: 100,
    summary: '制御反応媒体と伝達ゲルからHarvesterを組み上げる',
  },
  {
    id: 'RC8',
    kind: 'component',
    inputs: [stack('ReinforcedMatrix'), stack('DenseMatrix')],
    outputs: [stack('Storage')],
    energyCost: 80,
    summary: '強化構造からStorageを組み上げる',
  },
];

/**
 * コンポーネント分解。Disassemblerが実行する。
 * 出力は意図的に最下層物質へ「格下げ」される（中間物質は返らない）。
 * これにより分解回収は再クラフトの工程を要し、再生産経済が成立する。
 */
const DISASSEMBLY_RECIPES: readonly Recipe[] = [
  {
    id: 'RX1',
    kind: 'disassembly',
    inputs: [stack('Processor')],
    outputs: [stack('EncodedFragment', 2), stack('PatternChain'), stack('InfoSeed')],
    energyCost: 15,
    summary: 'Processorの分解。希少な情報系素材が回収できる',
  },
  {
    id: 'RX2',
    kind: 'disassembly',
    inputs: [stack('MemoryCore')],
    outputs: [stack('EncodedFragment', 2), stack('PatternChain'), stack('BaseSolid')],
    energyCost: 15,
    summary: 'MemoryCoreの分解',
  },
  {
    id: 'RX3',
    kind: 'disassembly',
    inputs: [stack('Assembler')],
    outputs: [stack('CatalystGrain'), stack('ChargedBinder'), stack('BindingShard'), stack('BaseSolid')],
    energyCost: 15,
    summary: 'Assemblerの分解。触媒が回収できる',
  },
  {
    id: 'RX4',
    kind: 'disassembly',
    inputs: [stack('Disassembler')],
    outputs: [stack('CatalystGrain'), stack('ChargedBinder'), stack('VolatileCore'), stack('BaseSolid')],
    energyCost: 15,
    summary: 'Disassemblerの分解',
  },
  {
    id: 'RX5',
    kind: 'disassembly',
    inputs: [stack('Actuator')],
    outputs: [stack('ConductiveGel'), stack('ReactiveFragment'), stack('FlexibleChain')],
    energyCost: 15,
    summary: 'Actuatorの分解',
  },
  {
    id: 'RX6',
    kind: 'disassembly',
    inputs: [stack('Sensor')],
    outputs: [stack('SignalFluid'), stack('PatternChain'), stack('BaseSolid')],
    energyCost: 15,
    summary: 'Sensorの分解',
  },
  {
    id: 'RX7',
    kind: 'disassembly',
    inputs: [stack('Harvester')],
    outputs: [stack('ConductiveGel'), stack('ReactiveFragment'), stack('BindingShard')],
    energyCost: 15,
    summary: 'Harvesterの分解',
  },
  {
    id: 'RX8',
    kind: 'disassembly',
    inputs: [stack('Storage')],
    outputs: [stack('DenseMatrix'), stack('BaseSolid'), stack('BindingShard')],
    energyCost: 15,
    summary: 'Storageの分解',
  },
];

export const RECIPES: readonly Recipe[] = [
  ...BASE_RECIPES,
  ...WASTE_RECIPES,
  ...INTERMEDIATE_RECIPES,
  ...COMPONENT_RECIPES,
  ...DISASSEMBLY_RECIPES,
];

export const RECIPE_MAP: ReadonlyMap<string, Recipe> = new Map(
  RECIPES.map(recipe => [recipe.id, recipe]),
);
