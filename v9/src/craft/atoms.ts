/**
 * 原子レイヤーの定義。
 * 原子は物質を構成する保存量であり、世界内で種類ごとに総量が保存される。
 * 仕様: docs/plan/craft_tree/requirements.md「物質と原子」
 */

export const ATOMS = ['S', 'B', 'A', 'I', 'T', 'C', 'X'] as const;

export type Atom = (typeof ATOMS)[number];

/** 原子構成。省略された原子は0個 */
export type AtomComposition = Partial<Readonly<Record<Atom, number>>>;

export const ATOM_INFO: Readonly<Record<Atom, { name: string; role: string }>> = {
  S: { name: 'Structure（構造）', role: '安定・骨格形成' },
  B: { name: 'Bond（結合）', role: '他物質との結合性' },
  A: { name: 'Active（活性）', role: '反応駆動' },
  I: { name: 'Information（情報）', role: '構造パターン保持' },
  T: { name: 'Transfer（伝達）', role: '信号・エネルギー伝達' },
  C: { name: 'Catalytic（触媒）', role: '反応変化を促進' },
  X: { name: 'Waste/Noise（不純物）', role: '副作用・ノイズ' },
};

export const emptyComposition = (): Readonly<Record<Atom, number>> => ({
  S: 0,
  B: 0,
  A: 0,
  I: 0,
  T: 0,
  C: 0,
  X: 0,
});

export const addCompositions = (
  a: AtomComposition,
  b: AtomComposition,
  scale = 1,
): Readonly<Record<Atom, number>> =>
  Object.fromEntries(
    ATOMS.map(atom => [atom, (a[atom] ?? 0) + (b[atom] ?? 0) * scale]),
  ) as Record<Atom, number>;

export const compositionsEqual = (a: AtomComposition, b: AtomComposition): boolean =>
  ATOMS.every(atom => (a[atom] ?? 0) === (b[atom] ?? 0));

/** 例: {S:2, B:1} → "S2B1" */
export const formatComposition = (composition: AtomComposition): string =>
  ATOMS.filter(atom => (composition[atom] ?? 0) > 0)
    .map(atom => `${atom}${composition[atom]}`)
    .join('');

export const atomCount = (composition: AtomComposition): number =>
  ATOMS.reduce((sum, atom) => sum + (composition[atom] ?? 0), 0);
