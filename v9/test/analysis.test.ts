import { describe, expect, it } from 'vitest';
import { ATOMS, addCompositions, emptyComposition } from '../src/craft/atoms';
import type { Atom } from '../src/craft/atoms';
import { planProduction } from '../src/craft/analysis';
import { RECIPES } from '../src/craft/recipes';
import { SUBSTANCES, SUBSTANCE_MAP } from '../src/craft/substances';

const FULL_COMPONENT_SET = SUBSTANCES.filter(substance => substance.tier === 'component').map(
  substance => ({ substanceId: substance.id, count: 1 }),
);

const totalAtoms = (entries: ReadonlyMap<string, number>): Readonly<Record<Atom, number>> =>
  [...entries.entries()].reduce(
    (acc, [substanceId, count]) =>
      addCompositions(acc, SUBSTANCE_MAP.get(substanceId)!.composition, count),
    emptyComposition(),
  );

describe('planProduction', () => {
  it('全コンポーネントが自然資源から生産可能', () => {
    for (const target of FULL_COMPONENT_SET) {
      expect(() => planProduction([target], SUBSTANCE_MAP, RECIPES)).not.toThrow();
    }
  });

  it('計画全体で原子が保存される（自然資源の原子 = 目標物 + 余剰在庫の原子）', () => {
    const plan = planProduction(FULL_COMPONENT_SET, SUBSTANCE_MAP, RECIPES);
    const consumed = totalAtoms(plan.naturalConsumption);
    const produced = addCompositions(
      totalAtoms(plan.leftovers),
      FULL_COMPONENT_SET.reduce(
        (acc, target) =>
          addCompositions(acc, SUBSTANCE_MAP.get(target.substanceId)!.composition, target.count),
        emptyComposition(),
      ),
      1,
    );
    for (const atom of ATOMS) {
      expect(produced[atom], `原子 ${atom}`).toBe(consumed[atom]);
    }
  });

  it('コンポーネント一式の生産はエネルギーを消費し、工程数は正', () => {
    const plan = planProduction(FULL_COMPONENT_SET, SUBSTANCE_MAP, RECIPES);
    expect(plan.totalEnergy).toBeGreaterThan(0);
    expect(plan.totalSteps).toBeGreaterThan(0);
  });

  it('Processorの生産は希少資源InfoSeedを正確に4消費する（I原子保存の帰結）', () => {
    const plan = planProduction(
      [{ substanceId: 'Processor', count: 1 }],
      SUBSTANCE_MAP,
      RECIPES,
    );
    const leftoverInfo = totalAtoms(plan.leftovers).I;
    expect((plan.naturalConsumption.get('InfoSeed') ?? 0) - leftoverInfo).toBe(4);
  });
});
