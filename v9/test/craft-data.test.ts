import { describe, expect, it } from 'vitest';
import { RECIPES, RECIPE_MAP } from '../src/craft/recipes';
import { SUBSTANCES, SUBSTANCE_MAP } from '../src/craft/substances';
import { validateCraftTree, validationErrors } from '../src/craft/validate';

/**
 * 実データ（v9クラフトツリー）が全検査を通ることの確認。
 * ここが唯一の「クラフトツリーの整合性」の根拠であり、
 * レシピ・物質の変更は必ずこのテストを通過しなければならない。
 */

describe('v9クラフトツリーの静的検証', () => {
  const issues = validateCraftTree(SUBSTANCES, RECIPES);

  it('エラーがない（原子保存・到達可能性・デッドエンド・原子循環・供給源）', () => {
    expect(validationErrors(issues)).toEqual([]);
  });

  it('警告もない（レシピ規模の目安内）', () => {
    expect(issues).toEqual([]);
  });
});

describe('エネルギー設計', () => {
  it('エネルギーを放出するレシピはR4とR13のみ（追加時はポンプ検査も追加すること）', () => {
    const negativeRecipes = RECIPES.filter(recipe => recipe.energyCost < 0).map(recipe => recipe.id);
    expect(negativeRecipes.sort()).toEqual(['R13', 'R4']);
  });

  it('物質が閉じる代表的な循環の合計エネルギーは正（エネルギーポンプが存在しない）', () => {
    const loopEnergy = (recipeIds: string[]): number =>
      recipeIds.reduce((sum, recipeId) => sum + (RECIPE_MAP.get(recipeId)?.energyCost ?? Number.NaN), 0);
    // A循環: VolatileCore → ReactiveFragment → ChargedBinder → VolatileCore
    expect(loopEnergy(['R4', 'R5', 'R6'])).toBeGreaterThan(0);
    // C循環: CatalystGrain → ActiveCatalyst → CatalystGrain
    expect(loopEnergy(['R12', 'R13'])).toBeGreaterThan(0);
    // 複合循環: R12 + R13 + R4 （CatalystGrain/ReactiveFragment/VolatileCore/BaseSolidが閉じる）
    expect(loopEnergy(['R12', 'R13', 'R4'])).toBeGreaterThan(0);
  });
});

describe('コンポーネントのレシピ被覆', () => {
  const components = SUBSTANCES.filter(substance => substance.tier === 'component');

  it('8種のコンポーネントが定義されている', () => {
    expect(components.map(component => component.id).sort()).toEqual([
      'Actuator',
      'Assembler',
      'Disassembler',
      'Harvester',
      'MemoryCore',
      'Processor',
      'Sensor',
      'Storage',
    ]);
  });

  it.each(
    components.map(component => [component.id] as const),
  )('%s に生成レシピと分解レシピがある', componentId => {
    const producers = RECIPES.filter(
      recipe =>
        recipe.kind === 'component' &&
        recipe.outputs.some(output => output.substanceId === componentId),
    );
    const disassemblers = RECIPES.filter(
      recipe =>
        recipe.kind === 'disassembly' &&
        recipe.inputs.some(input => input.substanceId === componentId),
    );
    expect(producers.length).toBeGreaterThanOrEqual(1);
    expect(disassemblers.length).toBeGreaterThanOrEqual(1);
  });

  it('分解レシピの出力はすべて最下層物質（分解では中間工程が返らない）', () => {
    const disassemblyOutputs = RECIPES.filter(recipe => recipe.kind === 'disassembly').flatMap(
      recipe => recipe.outputs.map(output => output.substanceId),
    );
    for (const substanceId of disassemblyOutputs) {
      expect(SUBSTANCE_MAP.get(substanceId)?.tier).toBe('base');
    }
  });
});

describe('クラフト戦略の多様性（v9ゴール: 同じ生産物を異なる手法で得られる）', () => {
  it('触媒レシピは触媒を消費しない（入力と出力に同数現れる）', () => {
    for (const recipeId of ['R1c', 'R27c']) {
      const recipe = RECIPE_MAP.get(recipeId);
      expect(recipe).toBeDefined();
      const catalystInputs = recipe!.inputs.filter(input =>
        SUBSTANCE_MAP.get(input.substanceId)?.category === 'catalyst',
      );
      expect(catalystInputs.length).toBeGreaterThanOrEqual(1);
      for (const catalystInput of catalystInputs) {
        const matching = recipe!.outputs.find(
          output => output.substanceId === catalystInput.substanceId,
        );
        expect(matching?.count).toBe(catalystInput.count);
      }
    }
  });

  it('触媒版レシピは通常版よりエネルギーコストが低い', () => {
    expect(RECIPE_MAP.get('R1c')!.energyCost).toBeLessThan(RECIPE_MAP.get('R1')!.energyCost);
    expect(RECIPE_MAP.get('R27c')!.energyCost).toBeLessThan(RECIPE_MAP.get('R27')!.energyCost);
  });

  it('dirty版レシピは安価だがResidueを排出する', () => {
    const pairs: Array<[string, string]> = [
      ['RD1', 'R1'],
      ['RD2', 'R9'],
    ];
    for (const [dirtyId, cleanId] of pairs) {
      const dirty = RECIPE_MAP.get(dirtyId)!;
      const clean = RECIPE_MAP.get(cleanId)!;
      expect(dirty.energyCost).toBeLessThan(clean.energyCost);
      expect(dirty.outputs.some(output => output.substanceId === 'Residue')).toBe(true);
    }
  });
});

describe('資源設計', () => {
  it('X原子はContaminatedMass（自然産出）によってのみ世界へ入る', () => {
    const naturalXCarriers = SUBSTANCES.filter(
      substance => substance.naturalAbundance !== undefined && (substance.composition.X ?? 0) > 0,
    );
    expect(naturalXCarriers.map(substance => substance.id)).toEqual(['ContaminatedMass']);
  });

  it('情報原子Iは希少資源であり、Processorが最大の需要を持つ', () => {
    const infoSources = SUBSTANCES.filter(
      substance => substance.naturalAbundance !== undefined && (substance.composition.I ?? 0) > 0,
    );
    expect(infoSources.map(substance => substance.naturalAbundance)).toEqual(['rare']);
    const componentInfoDemand = SUBSTANCES.filter(substance => substance.tier === 'component').map(
      substance => substance.composition.I ?? 0,
    );
    expect(Math.max(...componentInfoDemand)).toBe(SUBSTANCE_MAP.get('Processor')!.composition.I);
  });
});
