import { describe, expect, it } from 'vitest';
import type { Recipe, Substance } from '../src/craft/types';
import { validateCraftTree } from '../src/craft/validate';

/**
 * 検証器そのもののテスト。
 * 意図的に壊した小さなクラフトツリーを与え、各検査が欠陥を検出することを確認する。
 */

const substances: Substance[] = [
  {
    id: 'Ore',
    tier: 'base',
    category: 'structure',
    composition: { S: 2 },
    naturalAbundance: 'abundant',
    description: '',
  },
  {
    id: 'Gas',
    tier: 'base',
    category: 'active',
    composition: { A: 2 },
    naturalAbundance: 'limited',
    description: '',
  },
  { id: 'Plate', tier: 'base', category: 'structure', composition: { S: 2 }, description: '' },
];

const recipes: Recipe[] = [
  {
    id: 'OK1',
    kind: 'rearrangement',
    inputs: [{ substanceId: 'Ore', count: 1 }],
    outputs: [{ substanceId: 'Plate', count: 1 }],
    energyCost: 5,
    summary: '',
  },
  {
    id: 'OK2',
    kind: 'rearrangement',
    inputs: [{ substanceId: 'Plate', count: 1 }],
    outputs: [{ substanceId: 'Ore', count: 1 }],
    energyCost: 5,
    summary: '',
  },
];

const validate = (overrides: { substances?: Substance[]; recipes?: Recipe[] }) =>
  validateCraftTree(overrides.substances ?? substances, overrides.recipes ?? recipes);

describe('validateCraftTree', () => {
  it('整合したツリーではエラーを出さない', () => {
    // Gasは未消費・未循環だが、このテストでは対象外の検査なので個別コードのみ確認する
    const issues = validate({});
    expect(issues.filter(issue => issue.code === 'ATOM_IMBALANCE')).toHaveLength(0);
    expect(issues.filter(issue => issue.code === 'UNKNOWN_SUBSTANCE')).toHaveLength(0);
  });

  it('原子収支の崩れたレシピを検出する（元ドラフトR13: C1A1 → C1 + A2）', () => {
    const draftR13: Recipe = {
      id: 'draftR13',
      kind: 'decomposition',
      inputs: [{ substanceId: 'ActiveCatalyst', count: 1 }],
      outputs: [
        { substanceId: 'CatalystGrain', count: 1 },
        { substanceId: 'Gas', count: 1 },
      ],
      energyCost: 0,
      summary: '',
    };
    const extra: Substance[] = [
      ...substances,
      {
        id: 'ActiveCatalyst',
        tier: 'base',
        category: 'catalyst',
        composition: { C: 1, A: 1 },
        description: '',
      },
      {
        id: 'CatalystGrain',
        tier: 'base',
        category: 'catalyst',
        composition: { C: 1 },
        naturalAbundance: 'rare',
        description: '',
      },
    ];
    const issues = validate({ substances: extra, recipes: [...recipes, draftR13] });
    const imbalances = issues.filter(issue => issue.code === 'ATOM_IMBALANCE');
    expect(imbalances).toHaveLength(1);
    expect(imbalances[0].subject).toBe('draftR13');
    expect(imbalances[0].message).toContain('A');
  });

  it('未定義の物質参照を検出する', () => {
    const broken: Recipe = {
      id: 'BAD_REF',
      kind: 'synthesis',
      inputs: [{ substanceId: 'Unobtainium', count: 1 }],
      outputs: [{ substanceId: 'Plate', count: 1 }],
      energyCost: 5,
      summary: '',
    };
    const issues = validate({ recipes: [...recipes, broken] });
    expect(issues.some(issue => issue.code === 'UNKNOWN_SUBSTANCE' && issue.subject === 'BAD_REF')).toBe(true);
  });

  it('0以下・非整数の個数を検出する', () => {
    const broken: Recipe = {
      id: 'BAD_COUNT',
      kind: 'synthesis',
      inputs: [{ substanceId: 'Ore', count: 0 }],
      outputs: [{ substanceId: 'Plate', count: 1.5 }],
      energyCost: 5,
      summary: '',
    };
    const issues = validate({ recipes: [...recipes, broken] });
    expect(issues.filter(issue => issue.code === 'INVALID_COUNT' && issue.subject === 'BAD_COUNT')).toHaveLength(2);
  });

  it('自然産出せずどのレシピでも生成されない物質を検出する', () => {
    const orphan: Substance = {
      id: 'Orphan',
      tier: 'intermediate',
      category: 'structure',
      composition: { S: 4 },
      description: '',
    };
    const issues = validate({ substances: [...substances, orphan] });
    expect(issues.some(issue => issue.code === 'UNREACHABLE' && issue.subject === 'Orphan')).toBe(true);
  });

  it('入力が揃わないレシピの生成物は到達可能と見なさない', () => {
    // Seed(自然産出しない)を要求するレシピの生成物 Fruit は到達不能
    const extra: Substance[] = [
      ...substances,
      { id: 'Seed', tier: 'base', category: 'structure', composition: { S: 1, B: 1 }, description: '' },
      { id: 'Fruit', tier: 'intermediate', category: 'structure', composition: { S: 1, B: 1 }, description: '' },
    ];
    const growth: Recipe = {
      id: 'GROWTH',
      kind: 'synthesis',
      inputs: [{ substanceId: 'Seed', count: 1 }],
      outputs: [{ substanceId: 'Fruit', count: 1 }],
      energyCost: 5,
      summary: '',
    };
    const issues = validate({ substances: extra, recipes: [...recipes, growth] });
    expect(issues.some(issue => issue.code === 'UNREACHABLE' && issue.subject === 'Fruit')).toBe(true);
    expect(issues.some(issue => issue.code === 'UNREACHABLE' && issue.subject === 'Seed')).toBe(true);
  });

  it('どのレシピにも消費されない物質（デッドエンド）を検出する', () => {
    // Gasはどのレシピの入力にも現れない
    const issues = validate({});
    expect(issues.some(issue => issue.code === 'DEAD_END' && issue.subject === 'Gas')).toBe(true);
  });

  it('循環経路（長さ2以上）を持たない原子を検出する', () => {
    // A原子はGasにのみ含まれ、変換レシピが無いため循環しない
    const issues = validate({});
    expect(issues.some(issue => issue.code === 'NO_ATOM_CYCLE' && issue.subject === 'A')).toBe(true);
    // S原子は Ore ⇄ Plate で循環する
    expect(issues.some(issue => issue.code === 'NO_ATOM_CYCLE' && issue.subject === 'S')).toBe(false);
  });

  it('自然産出物質に含まれない原子を検出する', () => {
    const withI: Substance = {
      id: 'Lore',
      tier: 'base',
      category: 'information',
      composition: { I: 1 },
      description: '',
    };
    const issues = validate({ substances: [...substances, withI] });
    expect(issues.some(issue => issue.code === 'NO_NATURAL_SOURCE' && issue.subject === 'I')).toBe(true);
  });

  it('材料/生成物の種類数が4を超えるレシピに警告を出す', () => {
    const wide: Recipe = {
      id: 'WIDE',
      kind: 'synthesis',
      inputs: [
        { substanceId: 'Ore', count: 1 },
        { substanceId: 'Ore', count: 1 },
        { substanceId: 'Ore', count: 1 },
        { substanceId: 'Ore', count: 1 },
        { substanceId: 'Ore', count: 1 },
      ],
      outputs: [{ substanceId: 'Plate', count: 5 }],
      energyCost: 5,
      summary: '',
    };
    const issues = validate({ recipes: [...recipes, wide] });
    const warning = issues.find(issue => issue.code === 'RECIPE_SIZE' && issue.subject === 'WIDE');
    expect(warning?.severity).toBe('warning');
  });
});
