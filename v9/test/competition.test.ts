import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { buildCompetitionConfig } from '../src/programs/competition-config';
import { formatAtomTotals, totalAtoms } from '../src/sim/accounting';
import { buildInitialWorld } from '../src/sim/initial-state';
import { executeTick } from '../src/sim/simulation';
import type { GameParams } from '../src/params';
import type { World } from '../src/sim/types';
import { makeParams, snapshot } from './sim-helpers';

const competitionParams = (): GameParams =>
  makeParams({
    nodeAmountByAbundance: { abundant: 4000, common: 2000, limited: 1000, rare: 200 },
    energyNodeCount: 60,
  });

/** 種別ごとの稼働個体数（移動種=Actuatorを持つ、定住種=持たない） */
const census = (world: World): { mobile: number; sedentary: number; spread: number } => {
  let mobile = 0;
  let sedentary = 0;
  const mobilePositions: { x: number; y: number }[] = [];
  for (const obj of world.objects) {
    if (obj.kind !== 'group') continue;
    const members = obj.memberIds
      .map(id => world.objects.find(o => o.id === id))
      .filter((m): m is NonNullable<typeof m> => m !== undefined && m.kind === 'component');
    const alive = members.some(m => m.componentType === 'Processor' && m.running && m.durability > 0);
    if (!alive) continue;
    if (members.some(m => m.componentType === 'Actuator')) {
      mobile += 1;
      mobilePositions.push(obj.position);
    } else {
      sedentary += 1;
    }
  }
  let spread = 0;
  for (let i = 0; i < mobilePositions.length; i++) {
    for (let j = i + 1; j < mobilePositions.length; j++) {
      spread = Math.max(spread, Math.hypot(mobilePositions[i].x - mobilePositions[j].x, mobilePositions[i].y - mobilePositions[j].y));
    }
  }
  return { mobile, sedentary, spread };
};

const runCompetition = (seed: number, ticks: number) => {
  const params = competitionParams();
  const rng = createRng(seed);
  let world = buildInitialWorld(buildCompetitionConfig(seed), params, rng);
  const initialAtoms = formatAtomTotals(totalAtoms(world));
  let peakMobile = 0;
  let peakSedentary = 0;
  let maxSpread = 0;
  let sedentaryHitZero = false;
  for (let i = 0; i < ticks; i++) {
    world = executeTick(world, params, rng).world;
    // 集計は50tickごと（O(groups^2)のため毎tickは重い。ピーク検出には十分）
    if (i % 50 !== 0) continue;
    const c = census(world);
    peakMobile = Math.max(peakMobile, c.mobile);
    peakSedentary = Math.max(peakSedentary, c.sedentary);
    maxSpread = Math.max(maxSpread, c.spread);
    if (peakSedentary > 0 && c.sedentary === 0) sedentaryHitZero = true;
  }
  return { peakMobile, peakSedentary, maxSpread, sedentaryHitZero, world, initialAtoms };
};

const LONG = { timeout: 60000 };

describe('空間競争（移動種 vs 定住種）', () => {
  it('両種が同じ世界で繁殖し、原子保存が保たれる', () => {
    const r = runCompetition(2, 4000);
    expect(r.peakMobile).toBeGreaterThan(0);
    expect(r.peakSedentary).toBeGreaterThan(0);
    expect(formatAtomTotals(totalAtoms(r.world))).toBe(r.initialAtoms);
  });

  it('移動種が定着すると世界中の散在資源を使って優勢になり、定住種を競争排除しうる（seed 2）', LONG, () => {
    const r = runCompetition(2, 12000);
    // 移動種は多数（世界中に拡散）に達する
    expect(r.peakMobile).toBeGreaterThanOrEqual(8);
    // 移動種は世界全体へ広がる（100×100の世界で大きく離れる）
    expect(r.maxSpread).toBeGreaterThan(60);
    // 定住種は一度絶滅（競争排除）される
    expect(r.sedentaryHitZero).toBe(true);
    // 移動種は定住種のピークを上回る
    expect(r.peakMobile).toBeGreaterThan(r.peakSedentary);
  });

  it('勝敗は確率的（初期条件依存）: 定住種が優勢になるシードも存在する（seed 11）', LONG, () => {
    const r = runCompetition(11, 12000);
    // seed 11では定住種が移動種を上回る（founder freezeの籤で移動種が伸びない）
    expect(r.peakSedentary).toBeGreaterThan(r.peakMobile);
  });

  it('競争を含む世界でも決定論が保たれる（同一シード2回で完全一致）', () => {
    const params = competitionParams();
    const run = (): string => {
      const rng = createRng(2);
      let world = buildInitialWorld(buildCompetitionConfig(2), params, rng);
      for (let i = 0; i < 3000; i++) world = executeTick(world, params, rng).world;
      return snapshot(world);
    };
    expect(run()).toBe(run());
  });
});
