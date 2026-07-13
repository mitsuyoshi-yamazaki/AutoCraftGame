import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { buildEcologyConfig } from '../src/programs/ecology-config';
import { formatAtomTotals, totalAtoms } from '../src/sim/accounting';
import { buildInitialWorld } from '../src/sim/initial-state';
import { executeTick } from '../src/sim/simulation';
import type { GameParams } from '../src/params';
import type { World } from '../src/sim/types';
import { makeParams, snapshot } from './sim-helpers';

const runningProcessors = (world: World): number =>
  world.objects.filter(
    o => o.kind === 'component' && o.componentType === 'Processor' && o.running && o.durability > 0,
  ).length;

const runTo = (config: ReturnType<typeof buildEcologyConfig>, params: GameParams, ticks: number): World => {
  const rng = createRng(config.seed);
  let world = buildInitialWorld(config, params, rng);
  for (let i = 0; i < ticks; i++) world = executeTick(world, params, rng).world;
  return world;
};

describe('生態系実験', () => {
  it('定住種は空間の広さに動態が依存しない（ワールド100と200で結果が一致）', () => {
    const params = makeParams();
    // ワールドサイズ以外を同じにするため、絶対座標が同じになる spacing を固定
    const small = runTo(buildEcologyConfig(42, { colonies: 2, worldSize: 100, spacing: 20 }), params, 3000);
    const large = runTo(buildEcologyConfig(42, { colonies: 2, worldSize: 200, spacing: 20 }), params, 3000);
    // 各コロニーの内部動態は同一（個体数が一致）
    expect(runningProcessors(large)).toBe(runningProcessors(small));
    expect(runningProcessors(small)).toBeGreaterThan(0);
  });

  it('複数コロニーは相互作用せず線形にスケールする（2コロニーは1コロニーの倍）', () => {
    const params = makeParams();
    const one = runTo(buildEcologyConfig(42, { colonies: 1 }), params, 3000);
    const two = runTo(buildEcologyConfig(42, { colonies: 2, spacing: 20 }), params, 3000);
    expect(runningProcessors(two)).toBe(runningProcessors(one) * 2);
  });

  it('希少資源では距離に関係なく絶滅する（定住種は枯渇域から移動できない）', () => {
    const scarce = makeParams({ nodeAmountByAbundance: { abundant: 400, common: 200, limited: 60, rare: 6 } });
    const close = runTo(buildEcologyConfig(1, { colonies: 2, spacing: 4 }), scarce, 6000);
    const far = runTo(buildEcologyConfig(1, { colonies: 2, spacing: 20 }), scarce, 6000);
    expect(runningProcessors(close)).toBe(0);
    expect(runningProcessors(far)).toBe(0);
  });

  it('生態系全体でも決定論と原子保存が保たれる（変異・捕食を含む）', () => {
    const params = makeParams();
    const config = buildEcologyConfig(7, { colonies: 2, worldSize: 150, mutation: true, predator: true });
    const initialAtoms = formatAtomTotals(totalAtoms(buildInitialWorld(config, params, createRng(7))));
    const first = runTo(config, params, 2500);
    const second = runTo(config, params, 2500);
    expect(snapshot(second)).toBe(snapshot(first));
    expect(formatAtomTotals(totalAtoms(first))).toBe(initialAtoms);
  });
});
