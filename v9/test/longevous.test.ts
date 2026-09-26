import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import {
  buildLongevousConfig,
  buildLongevousProgram,
  DEFAULT_FOUNDERS,
} from '../src/programs/longevous';
import { buildMobileConfig } from '../src/programs/mobile';
import { formatAtomTotals, totalAtoms } from '../src/sim/accounting';
import { buildInitialWorld } from '../src/sim/initial-state';
import { executeTick } from '../src/sim/simulation';
import type { GameParams } from '../src/params';
import type { InitialConfig } from '../src/sim/initial-state';
import type { World } from '../src/sim/types';
import { makeParams, snapshot } from './sim-helpers';

// 移動種と同じ環境（散在資源＋潤沢なエネルギー）。比較の条件を揃える
const mobileParams = (): GameParams =>
  makeParams({
    nodeAmountByAbundance: { abundant: 4000, common: 2000, limited: 1000, rare: 200 },
    energyNodeCount: 60,
  });

interface RunResult {
  /** 実行中に一度でも存在したProcessor（＝生まれた個体）の数 */
  readonly individuals: number;
  /** 同時に稼働したProcessorの最大数 */
  readonly peak: number;
  /** 最後に稼働個体がいたtick */
  readonly lastAliveTick: number;
  /** 全コンポーネントを通じた最大修理回数 */
  readonly maxRepairCount: number;
  readonly atomsPreserved: boolean;
}

const run = (config: InitialConfig, params: GameParams, ticks: number): RunResult => {
  const rng = createRng(config.seed);
  let world: World = buildInitialWorld(config, params, rng);
  const initialAtoms = formatAtomTotals(totalAtoms(world));
  const processors = new Set<number>();
  let peak = 0;
  let lastAliveTick = 0;
  let maxRepairCount = 0;
  for (let i = 0; i < ticks; i++) {
    world = executeTick(world, params, rng).world;
    let running = 0;
    for (const obj of world.objects) {
      if (obj.kind !== 'component') continue;
      maxRepairCount = Math.max(maxRepairCount, obj.repairCount);
      if (obj.componentType !== 'Processor') continue;
      processors.add(obj.id);
      if (obj.running && obj.durability > 0) running += 1;
    }
    peak = Math.max(peak, running);
    if (running > 0) lastAliveTick = i;
  }
  return {
    individuals: processors.size,
    peak,
    lastAliveTick,
    maxRepairCount,
    atomsPreserved: formatAtomTotals(totalAtoms(world)) === initialAtoms,
  };
};

describe('長命移動複製種', () => {
  it('プログラムは拡張pmem(4096語)に収まる', () => {
    expect(buildLongevousProgram()).toHaveLength(4096);
    expect(() => buildLongevousProgram({ mutation: true })).not.toThrow();
  });

  it('既定の初期配置は複数の祖先個体を離して置く', () => {
    const config = buildLongevousConfig(42);
    expect(config.ancestors).toHaveLength(DEFAULT_FOUNDERS);
    // 互いに十分離れており、初期から資源を奪い合わない
    const spots = config.ancestors!.map(a => ({ x: a.x, y: a.y }));
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y)).toBeGreaterThan(20);
      }
    }
    // 個体ごとに乱数種が異なる（同じだと彷徨の方向まで揃ってしまう）
    const programs = config.ancestors!.map(a => a.components[0].program!.join(','));
    expect(new Set(programs).size).toBe(DEFAULT_FOUNDERS);
  });

  it('器官を修理しながら移動複製する（原子は保存される）', () => {
    const result = run(buildLongevousConfig(42, { founders: 1 }), mobileParams(), 12000);
    // 修理が実際に行われた（維持が働いている）
    expect(result.maxRepairCount).toBeGreaterThan(0);
    // 複製した（2個体以上が同時に稼働した）
    expect(result.peak).toBeGreaterThanOrEqual(2);
    expect(result.atomsPreserved).toBe(true);
  });

  it('移動複製種より長く生き、より多くの子を残す', () => {
    const params = mobileParams();
    // 移動複製種の系統はこの時点で絶えており、長命種はまだ増え続けている
    const ticks = 16000;
    // 移動複製種は単一祖先なので、こちらも1個体にして条件を揃える
    const longevous = run(buildLongevousConfig(42, { founders: 1 }), params, ticks);
    const mobile = run(buildMobileConfig(42), params, ticks);

    // 移動複製種はSensorを失って早逝し、系統がこの時点で絶えている
    expect(mobile.lastAliveTick).toBeLessThan(ticks - 1);
    expect(mobile.maxRepairCount).toBe(0);
    // 長命種は同じ時点でまだ稼働しており、残した個体数も多い
    expect(longevous.lastAliveTick).toBe(ticks - 1);
    expect(longevous.individuals).toBeGreaterThan(mobile.individuals);
  });

  it('修理で排出された摩耗材を拾い直し、地面に捨てない', () => {
    const params = mobileParams();
    const rng = createRng(12);
    let world = buildInitialWorld(buildLongevousConfig(12, { founders: 1 }), params, rng);
    let repairs = 0;
    for (let i = 0; i < 12000; i++) {
      world = executeTick(world, params, rng).world;
      repairs = world.objects.reduce(
        (max, o) => (o.kind === 'component' ? Math.max(max, o.repairCount) : max),
        0,
      );
    }
    // 修理は起きている（＝摩耗材が排出されている）
    expect(repairs).toBeGreaterThan(0);
    // それでも修理材料は地面に溜まっていない（排出のたびに拾い直している）
    const dropped = world.objects
      .filter((o): o is Extract<typeof o, { kind: 'ground' }> => o.kind === 'ground')
      .reduce((sum, o) => sum + o.count, 0);
    expect(dropped).toBeLessThan(repairs);
  });

  it('長命種を含む世界でも決定論が保たれる（同一シード2回で完全一致）', () => {
    const params = mobileParams();
    const once = (): string => {
      const rng = createRng(42);
      let world = buildInitialWorld(buildLongevousConfig(42), params, rng);
      for (let i = 0; i < 1500; i++) world = executeTick(world, params, rng).world;
      return snapshot(world);
    };
    expect(once()).toBe(once());
  });
});
