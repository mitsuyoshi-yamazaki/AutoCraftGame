import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { buildRepairerConfig } from '../src/programs/repairer';
import { formatAtomTotals, totalAtoms } from '../src/sim/accounting';
import { buildInitialWorld } from '../src/sim/initial-state';
import { executeTick } from '../src/sim/simulation';
import type { GameParams } from '../src/params';
import type { ComponentObject, ComponentType, World } from '../src/sim/types';
import { makeParams } from './sim-helpers';

const organ = (world: World, type: ComponentType): ComponentObject | undefined =>
  world.objects.find(
    (o): o is ComponentObject => o.kind === 'component' && o.componentType === type,
  );

const run = (repair: boolean, params: GameParams, ticks: number): { world: World; procDeath: number } => {
  const config = buildRepairerConfig(42, repair);
  const rng = createRng(config.seed);
  let world = buildInitialWorld(config, params, rng);
  let procDeath = -1;
  for (let i = 0; i < ticks; i++) {
    world = executeTick(world, params, rng).world;
    const p = organ(world, 'Processor');
    if (procDeath < 0 && (p === undefined || p.durability <= 0)) procDeath = world.tick;
  }
  return { world, procDeath };
};

describe('自己修復種（自己修復）', () => {
  it('修理なしのProcessorは経年劣化で約5000tickで死ぬ（ベースライン）', () => {
    const params = makeParams();
    const { procDeath } = run(false, params, 5500);
    expect(procDeath).toBeGreaterThan(4000);
    expect(procDeath).toBeLessThan(5200);
  });

  it('自己修復により、ベースラインが死ぬ時刻を過ぎても全器官が健全に保たれる', () => {
    // 豊かなクレードル（希少資源が潤沢）で、限界が純粋なエネルギー壁になる条件
    const params = makeParams({
      nodeAmountByAbundance: { abundant: 40000, common: 20000, limited: 20000, rare: 20000 },
    });
    const initialAtoms = formatAtomTotals(totalAtoms(buildInitialWorld(buildRepairerConfig(42, true), params, createRng(42))));

    const { world } = run(true, params, 5000);
    // ベースラインが死んだ後(t5000)も、修復種は全器官が健全（>700）
    for (const type of ['Processor', 'Assembler', 'Harvester'] as const) {
      const c = organ(world, type);
      expect(c, type).toBeDefined();
      expect(c!.durability, type).toBeGreaterThan(700);
    }
    // 修理を繰り返した証拠（repairCountが大きい）
    expect(organ(world, 'Processor')!.repairCount).toBeGreaterThan(30);
    // 原子保存
    expect(formatAtomTotals(totalAtoms(world))).toBe(initialAtoms);
  });

  it('逓増する修理コストが壁になる: 修理回数はStorage容量で頭打ちになる（R4）', () => {
    // 修理コスト = 基本料(40) × 修理回数。容量2000 → 40×50=2000 で支払い不能
    const params = makeParams({
      nodeAmountByAbundance: { abundant: 40000, common: 20000, limited: 20000, rare: 20000 },
    });
    const { world } = run(true, params, 9000);
    // 修理回数はエネルギー容量の壁(約49回)で頭打ち、無限に修理し続けることはできない
    const rc = organ(world, 'Processor')?.repairCount ?? 0;
    expect(rc).toBeGreaterThanOrEqual(45);
    expect(rc).toBeLessThanOrEqual(55);
  });
});
