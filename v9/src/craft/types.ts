import type { AtomComposition } from './atoms';

/** 物質の階層。base=最下層(自然産出しうる), intermediate=中間物質, component=コンポーネント */
export type SubstanceTier = 'base' | 'intermediate' | 'component';

export type SubstanceCategory =
  | 'structure' // 構造系
  | 'active' // 活性系
  | 'transfer' // 伝達系
  | 'information' // 情報系
  | 'catalyst' // 触媒系
  | 'waste' // 不純物系
  | 'component'; // コンポーネント

/** 自然産出する場合の存在量の目安（資源ノード設計時の入力になる） */
export type Abundance = 'abundant' | 'common' | 'limited' | 'rare';

export type Substance = Readonly<{
  id: string;
  tier: SubstanceTier;
  category: SubstanceCategory;
  composition: AtomComposition;
  /** 自然産出する物質のみ設定する。未設定はクラフト経由でのみ入手可能 */
  naturalAbundance?: Abundance;
  description: string;
}>;

export type ItemStack = Readonly<{
  substanceId: string;
  count: number;
}>;

export type RecipeKind =
  | 'synthesis' // 合成型（高次化）
  | 'decomposition' // 分解型（低次化）
  | 'rearrangement' // 再配置型（構造変換）
  | 'refine' // 不純物分離
  | 'component' // コンポーネント生成
  | 'disassembly'; // コンポーネント分解

export type Recipe = Readonly<{
  id: string;
  kind: RecipeKind;
  inputs: readonly ItemStack[];
  outputs: readonly ItemStack[];
  /**
   * エネルギーコスト（正=消費、負=放出）。
   * 値は暫定のバランス調整対象。閉じたレシピ循環の合計は必ず正であること
   * （エネルギーポンプ禁止。test/craft-data.test.ts で代表循環を検証する）。
   */
  energyCost: number;
  summary: string;
}>;
