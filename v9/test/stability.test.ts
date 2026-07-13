import { describe, expect, it } from 'vitest';
import { RECIPES } from '../src/craft/recipes';
import { SUBSTANCES, SUBSTANCE_MAP } from '../src/craft/substances';
import {
  linearStabilityDelta,
  spontaneousRecipes,
  stabilityDelta,
  stabilityOf,
} from '../src/craft/stability';

describe('安定性モデル', () => {
  it('線形項（原子構成の重み和）は全レシピで不変 — 元ドラフトの線形モデルでは自発変化の方向が定義できないことの証明', () => {
    for (const recipe of RECIPES) {
      expect(linearStabilityDelta(recipe, SUBSTANCE_MAP), recipe.id).toBe(0);
    }
  });

  it('自発変化しうるレシピはコンポーネント分解（RX*）のみ', () => {
    const spontaneous = spontaneousRecipes(RECIPES, SUBSTANCE_MAP).map(recipe => recipe.id);
    expect(spontaneous.sort()).toEqual(['RX1', 'RX2', 'RX3', 'RX4', 'RX5', 'RX6', 'RX7', 'RX8']);
  });

  it('コンポーネント生成は合計安定性を下げる（構造化はエネルギー投入で正当化される）', () => {
    for (const recipe of RECIPES.filter(candidate => candidate.kind === 'component')) {
      expect(stabilityDelta(recipe, SUBSTANCE_MAP), recipe.id).toBeLessThan(0);
    }
  });

  it('VolatileCoreは最も不安定な最下層物質', () => {
    const baseSubstances = SUBSTANCES.filter(substance => substance.tier === 'base');
    const minimum = Math.min(...baseSubstances.map(stabilityOf));
    expect(stabilityOf(SUBSTANCE_MAP.get('VolatileCore')!)).toBe(minimum);
  });

  it('Storageはコンポーネント中で最も安定', () => {
    const components = SUBSTANCES.filter(substance => substance.tier === 'component');
    const maximum = Math.max(...components.map(stabilityOf));
    expect(stabilityOf(SUBSTANCE_MAP.get('Storage')!)).toBe(maximum);
  });
});
