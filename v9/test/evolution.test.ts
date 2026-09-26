/**
 * 実験09（進化する形質）の検証。
 *
 * 守りたい不変条件は2つある。
 * 1. **既存種を変えていないこと**。進化モードは長命移動複製種への追加であり、
 *    指定しなければ生成されるプログラムは1語も変わってはならない（実験08と録画の再現性）
 * 2. **変異が区画の外へ出ないこと**。区画限定変異が売りなので、これが破れたら主張が崩れる
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EVOLUTION_PARAMS } from '../src/experiments';
import {
  EVOLVABLE_PARAMS,
  PARAM_BASE,
  planDiffCount,
  planFingerprint,
  PLOG_CLAMP,
  PLOG_PLAN_OP,
  PLOG_PLAN_STEP,
  PLOG_SLOT,
  readDrawLog,
  readMutationLog,
  readParams,
  SELFLOG_BASE,
  SELFLOG_WORDS,
  writeEvolutionTables,
} from '../src/programs/evolution';
import {
  buildLongevousConfig,
  buildLongevousProgram,
  PLAN_LAYOUT,
  PLAN_STEP_TOTAL,
} from '../src/programs/longevous';
import { createRng } from '../src/rng';
import { buildInitialWorld } from '../src/sim/initial-state';
import { runTicks } from '../src/sim/simulation';
import type { ProcessorComponent, World } from '../src/sim/types';
import { isWreck } from '../src/sim/types';

const hashOf = (words: readonly number[]): string =>
  createHash('sha256').update(Buffer.from(Uint16Array.from(words).buffer)).digest('hex').slice(0, 16);

const runningProcessors = (world: World): ProcessorComponent[] =>
  world.objects.filter(
    (o): o is ProcessorComponent =>
      o.kind === 'component' && o.componentType === 'Processor' && !isWreck(o) && o.running,
  );

describe('既存種への非侵襲', () => {
  it('evolvable を指定しない長命移動複製種のプログラムは1語も変わらない', () => {
    // この値が変わったら実験08 と録画シナリオ（seed 5）の結果も変わる。
    // 変えるときは録画の再現性を確認したうえで、意図的に更新すること
    expect(hashOf(buildLongevousProgram())).toBe('da77786652137faf');
    expect(hashOf(buildLongevousProgram({ mutation: true, seedSalt: 3 }))).toBe('0157f14a0c28ca38');
  });

  it('進化モードのプログラムは別物である（＝取り違えていない）', () => {
    expect(hashOf(buildLongevousProgram({ evolvable: {} }))).not.toBe(hashOf(buildLongevousProgram()));
  });
});

describe('形質表', () => {
  it('初期値・下限・上限・刻みを所定のアドレスへ書く', () => {
    const memory = new Array<number>(4096).fill(0);
    writeEvolutionTables(memory);
    EVOLVABLE_PARAMS.forEach((spec, i) => {
      expect(memory[PARAM_BASE + i]).toBe(spec.init);
    });
    expect(readParams(memory)).toEqual(EVOLVABLE_PARAMS.map(p => p.init));
  });

  it('境界の外の初期値は受け付けない', () => {
    const memory = new Array<number>(4096).fill(0);
    expect(() => writeEvolutionTables(memory, { childEnergyDowry: 99999 })).toThrow();
  });

  it('記録欄は形質区画の外にある（記録そのものが変異しないこと）', () => {
    const paramEnd = PARAM_BASE + EVOLVABLE_PARAMS.length;
    for (const addr of [PLOG_SLOT, PLOG_CLAMP, PLOG_PLAN_STEP, PLOG_PLAN_OP]) {
      expect(addr).toBeGreaterThanOrEqual(paramEnd);
    }
  });
});

describe('工程表の指紋', () => {
  it('1語違えば違う値になる', () => {
    const base = buildLongevousProgram({ evolvable: {} });
    const words = PLAN_STEP_TOTAL * PLAN_LAYOUT.wordsPerStep;
    const changed = [...base];
    changed[PLAN_LAYOUT.base + 1] += 1;
    expect(planFingerprint(changed, PLAN_LAYOUT.base, words)).not.toBe(
      planFingerprint(base, PLAN_LAYOUT.base, words),
    );
    expect(planDiffCount(changed, base, PLAN_LAYOUT.base, words)).toBe(1);
  });
});

describe('区画限定変異（実際に走らせる）', () => {
  it('子のゲノムは、形質区画と記録欄の外では親と完全に一致する', () => {
    const config = buildLongevousConfig(26, { evolvable: { gateMask: 0 } });
    const rng = createRng(26);
    let world = buildInitialWorld({ ...config, seed: 26 }, EVOLUTION_PARAMS, rng);
    const founders = runningProcessors(world);
    const founderIds = new Set(founders.map(p => p.id));
    const parentMemory = founders[0].memory;

    world = runTicks(world, EVOLUTION_PARAMS, rng, 2500);
    const children = runningProcessors(world).filter(p => !founderIds.has(p.id));
    expect(children.length).toBeGreaterThan(0);

    const child = children[0];
    const exempt = new Set<number>([PLOG_SLOT, PLOG_CLAMP, PLOG_PLAN_STEP, PLOG_PLAN_OP]);
    for (let i = 0; i < EVOLVABLE_PARAMS.length; i++) exempt.add(PARAM_BASE + i);
    // 引きの記録欄（親が自分に書く観測用の欄）も、複写の時点の値がそのまま子に渡るので外す
    for (let i = 0; i < SELFLOG_WORDS; i++) exempt.add(SELFLOG_BASE + i);
    // 実行時に書き換わるグローバル領域（乱数種・作業用）は比較から外す
    const globalsFrom = 2772;
    const globalsTo = 2788;

    const unexpected: number[] = [];
    for (let addr = 0; addr < parentMemory.length; addr++) {
      if (exempt.has(addr)) continue;
      if (addr >= globalsFrom && addr < globalsTo) continue;
      if (child.memory[addr] !== parentMemory[addr]) unexpected.push(addr);
    }
    expect(unexpected).toEqual([]);
  });

  it('変異の記録が、実際に変わった形質と一致する', () => {
    const config = buildLongevousConfig(26, { evolvable: { gateMask: 0 } });
    const rng = createRng(26);
    let world = buildInitialWorld({ ...config, seed: 26 }, EVOLUTION_PARAMS, rng);
    const founderIds = new Set(runningProcessors(world).map(p => p.id));
    const init = EVOLVABLE_PARAMS.map(p => p.init);

    world = runTicks(world, EVOLUTION_PARAMS, rng, 2500);
    const child = runningProcessors(world).filter(p => !founderIds.has(p.id))[0];
    const log = readMutationLog(child.memory);
    const params = readParams(child.memory);
    const changed = params.map((v, i) => (v === init[i] ? -1 : i)).filter(i => i >= 0);

    expect(log.mutatedSlot).not.toBeNull();
    // 境界で切り詰められると値が変わらないことがあるので、そのときだけ差分0を許す
    if (log.clamped === null) expect(changed).toEqual([log.mutatedSlot]);
    for (const i of changed) {
      expect(Math.abs(params[i] - init[i])).toBe(EVOLVABLE_PARAMS[i].step);
    }
  });

  it('親は引いた瞬間に自分のメモリへ記録を残す（子が稼働したかに依らない）', () => {
    const config = buildLongevousConfig(26, { evolvable: { gateMask: 0 } });
    const rng = createRng(26);
    let world = buildInitialWorld({ ...config, seed: 26 }, EVOLUTION_PARAMS, rng);
    const founders = runningProcessors(world);
    // 走らせる前は誰も引いていない
    expect(founders.every(p => readDrawLog(p.memory).seed === 0)).toBe(true);

    world = runTicks(world, EVOLUTION_PARAMS, rng, 2500);
    const drew = runningProcessors(world)
      .map(p => readDrawLog(p.memory))
      .filter(log => log.seed !== 0);
    expect(drew.length).toBeGreaterThan(0);
    for (const log of drew) {
      expect(log.slot).not.toBeNull();
      expect([1, -1]).toContain(log.dir);
      // 切り詰めが起きていなければ、変異前後の差はちょうど刻み1つ分である
      if (log.clamped === null && log.valueBefore !== null && log.valueAfter !== null) {
        expect(Math.abs(log.valueAfter - log.valueBefore)).toBe(
          EVOLVABLE_PARAMS[log.slot ?? 0].step,
        );
      }
    }
  });

  it('工程表モードでは形質区画が動かず、工程表だけが変わる', () => {
    const config = buildLongevousConfig(26, { evolvable: { target: 'plan', gateMask: 0 } });
    const rng = createRng(26);
    let world = buildInitialWorld({ ...config, seed: 26 }, EVOLUTION_PARAMS, rng);
    const founders = runningProcessors(world);
    const founderIds = new Set(founders.map(p => p.id));
    const founderMemory = founders[0].memory;
    const words = PLAN_STEP_TOTAL * PLAN_LAYOUT.wordsPerStep;

    world = runTicks(world, EVOLUTION_PARAMS, rng, 2500);
    const child = runningProcessors(world).filter(p => !founderIds.has(p.id))[0];

    expect(readParams(child.memory)).toEqual(EVOLVABLE_PARAMS.map(p => p.init));
    expect(planDiffCount(child.memory, founderMemory, PLAN_LAYOUT.base, words)).toBeGreaterThan(0);
    expect(readMutationLog(child.memory).planOp).not.toBeNull();
  });
});
