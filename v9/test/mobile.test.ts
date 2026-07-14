import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { buildMobileConfig, buildMobileProgram } from '../src/programs/mobile';
import { buildAncestorConfig } from '../src/programs/ancestor-config';
import { formatAtomTotals, totalAtoms } from '../src/sim/accounting';
import { buildInitialWorld } from '../src/sim/initial-state';
import { executeTick } from '../src/sim/simulation';
import type { GameParams } from '../src/params';
import type { GroupObject, World } from '../src/sim/types';
import { makeParams, snapshot } from './sim-helpers';

// 移動種は散在資源＋潤沢なエネルギーの環境を前提とする（定住種のクレードルを使わない）
const mobileParams = (): GameParams =>
  makeParams({
    nodeAmountByAbundance: { abundant: 4000, common: 2000, limited: 1000, rare: 200 },
    energyNodeCount: 60,
  });

const runningProcessors = (world: World): number =>
  world.objects.filter(
    o => o.kind === 'component' && o.componentType === 'Processor' && o.running && o.durability > 0,
  ).length;

const fullGroups = (world: World): GroupObject[] =>
  world.objects.filter((o): o is GroupObject => o.kind === 'group' && o.memberIds.length >= 6);

const maxSpread = (world: World): number => {
  const groups = fullGroups(world);
  let d = 0;
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      d = Math.max(d, Math.hypot(groups[i].position.x - groups[j].position.x, groups[i].position.y - groups[j].position.y));
    }
  }
  return d;
};

describe('移動複製種', () => {
  it('プログラムは拡張pmem(4096語)に収まる', () => {
    expect(buildMobileProgram()).toHaveLength(4096);
    expect(() => buildMobileProgram({ mutation: true })).not.toThrow();
  });

  it('探索採取で資源を集めて6部品の子を複製し、子も6部品の移動種である', () => {
    const params = mobileParams();
    const config = buildMobileConfig(42);
    const rng = createRng(42);
    let world = buildInitialWorld(config, params, rng);
    const initialAtoms = formatAtomTotals(totalAtoms(world));

    let peak = 1;
    let spread = 0;
    for (let i = 0; i < 8000; i++) {
      world = executeTick(world, params, rng).world;
      peak = Math.max(peak, runningProcessors(world));
      spread = Math.max(spread, maxSpread(world));
    }
    // 複製した（2個体以上が同時に稼働した）
    expect(peak).toBeGreaterThanOrEqual(2);
    // 子は6部品（Actuator+Sensorを含む移動種）— 6メンバーのグループが2つ以上生じた
    // 個体は世界中に拡散した（局所に留まらない。ワールドは100×100）
    expect(spread).toBeGreaterThan(40);
    // 原子保存
    expect(formatAtomTotals(totalAtoms(world))).toBe(initialAtoms);
  });

  it('移動種は世界中へ拡散するが、定住種は生誕地に留まる（局所枯渇への対照）', () => {
    const params = mobileParams();
    // 移動種
    const mrng = createRng(42);
    let mworld = buildInitialWorld(buildMobileConfig(42), params, mrng);
    let mobileSpread = 0;
    for (let i = 0; i < 8000; i++) {
      mworld = executeTick(mworld, params, mrng).world;
      mobileSpread = Math.max(mobileSpread, maxSpread(mworld));
    }
    // 定住種（ancestor, クレードル）: 全個体が生誕地(50,50)近傍に留まる
    const arng = createRng(42);
    let aworld = buildInitialWorld(buildAncestorConfig(42), params, arng);
    for (let i = 0; i < 8000; i++) aworld = executeTick(aworld, params, arng).world;
    let sedentarySpread = 0;
    const groups = aworld.objects.filter((o): o is GroupObject => o.kind === 'group');
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        sedentarySpread = Math.max(sedentarySpread, Math.hypot(groups[i].position.x - groups[j].position.x, groups[i].position.y - groups[j].position.y));
      }
    }
    // 移動種は広く拡散し、定住種は狭い範囲に固まる
    expect(mobileSpread).toBeGreaterThan(40);
    expect(sedentarySpread).toBeLessThan(15);
    expect(mobileSpread).toBeGreaterThan(sedentarySpread * 3);
  });

  it('移動種を含む世界でも決定論が保たれる（同一シード2回で完全一致）', () => {
    const params = mobileParams();
    const run = (): string => {
      const rng = createRng(42);
      let world = buildInitialWorld(buildMobileConfig(42), params, rng);
      for (let i = 0; i < 2500; i++) world = executeTick(world, params, rng).world;
      return snapshot(world);
    };
    expect(run()).toBe(run());
  });
});
