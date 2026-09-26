/**
 * 実験09の集計。生ログ（JSONL）だけを入力に、事前登録した判定規則 A1/A2/A3 を機械的に評価する。
 *
 *   npx tsx src/tools/evolution-report.ts [--dir docs/experiments/data/09] [--label evolve-g0]
 *
 * 判定規則は docs/experiments/09_evolution_search.md の「事前登録した判定規則」にある。
 * **このツールは規則を解釈しない。書かれた条件をそのまま数える。**
 */

import { readdirSync, readFileSync } from 'node:fs';
import { EVOLVABLE_PARAMS } from '../programs/evolution';

const SEED_AGREEMENT_REQUIRED = 6;
const SEED_TOTAL_EXPECTED = 8;
/** A3: 中立対照の移動量がこの比を超えたら「浮動と区別できない」 */
const NEUTRAL_RATIO_LIMIT = 0.5;

interface Birth {
  readonly tick: number;
  readonly seed: number;
  readonly label: string;
  readonly childId: number;
  readonly parentId: number | null;
  readonly founderId: number | null;
  readonly generation: number;
  readonly params: readonly number[];
  readonly paramsBefore: readonly number[] | null;
  readonly mutatedSlot: number | null;
  readonly clamped: 'low' | 'high' | null;
}

interface Draw {
  readonly seed: number;
  readonly parentId: number;
  readonly lcg: number;
  readonly slot: number | null;
  readonly dir: number | null;
  readonly valueBefore: number | null;
  readonly valueAfter: number | null;
  readonly clamped: 'low' | 'high' | null;
}

interface SweepRow {
  readonly param: string | null;
  readonly value: number | null;
  readonly seed: number;
  readonly births: number;
}

const readJsonl = <T>(path: string): T[] =>
  readFileSync(path, 'utf-8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line) as T);

const mean = (values: readonly number[]): number =>
  values.length === 0 ? Number.NaN : values.reduce((a, b) => a + b, 0) / values.length;

const round = (value: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/**
 * 上下が等確率（p=0.5）という帰無の下で、これ以上に偏る確率（両側）。
 *
 * **変異演算子そのものは1周期で完全に釣り合っている**ので、引きの段階で偏るなら、
 * それは「どの状態で引きが起きるかが表現型で決まる」ことから来る交絡である。
 * どの形質の結果が交絡しているかを明示するために測る。
 */
const binomialTwoSided = (up: number, down: number): number => {
  const n = up + down;
  if (n === 0) return Number.NaN;
  const logFactorial: number[] = [0];
  for (let i = 1; i <= n; i++) logFactorial[i] = logFactorial[i - 1] + Math.log(i);
  const pmf = (k: number): number =>
    Math.exp(logFactorial[n] - logFactorial[k] - logFactorial[n - k] - n * Math.log(2));
  const observed = pmf(up);
  let total = 0;
  for (let k = 0; k <= n; k++) {
    // 浮動小数の誤差で同確率の項が落ちないよう、わずかに緩めて比較する
    if (pmf(k) <= observed * (1 + 1e-9)) total += pmf(k);
  }
  return Math.min(1, total);
};

/** 引かれたスロットの度数が一様からどれだけ外れているか（自由度 = スロット数-1 のχ²） */
const chiSquareUniform = (counts: readonly number[]): number => {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return Number.NaN;
  const expected = total / counts.length;
  return counts.reduce((acc, c) => acc + ((c - expected) ** 2) / expected, 0);
};

interface SeedSummary {
  readonly seed: number;
  readonly births: number;
  readonly maxGeneration: number;
  /** 出生時の形質の平均（全出生を通じて） */
  readonly birthMean: readonly number[];
  /** 創始者値からの移動量 */
  readonly delta: readonly number[];
  /** 境界に触れた出生を除いた移動量 */
  readonly deltaNoClamp: readonly number[];
  readonly slotCounts: readonly number[];
  readonly clampCounts: { readonly low: number; readonly high: number };
  readonly variantBirths: number;
  readonly lineages: readonly { founderId: number; births: number; delta: readonly number[] }[];
}

const summarizeSeed = (rows: readonly Birth[]): SeedSummary => {
  const seed = rows[0].seed;
  const init = EVOLVABLE_PARAMS.map(p => p.init);
  const birthMean = EVOLVABLE_PARAMS.map((_, i) => mean(rows.map(r => r.params[i])));
  const noClamp = rows.filter(r => r.clamped === null);
  const byFounder = new Map<number, Birth[]>();
  for (const row of rows) {
    const key = row.founderId ?? -1;
    byFounder.set(key, [...(byFounder.get(key) ?? []), row]);
  }
  return {
    seed,
    births: rows.length,
    maxGeneration: rows.reduce((m, r) => Math.max(m, r.generation), 0),
    birthMean: birthMean.map(v => round(v)),
    delta: birthMean.map((v, i) => round(v - init[i])),
    deltaNoClamp: EVOLVABLE_PARAMS.map((_, i) => round(mean(noClamp.map(r => r.params[i])) - init[i])),
    slotCounts: EVOLVABLE_PARAMS.map((_, i) => rows.filter(r => r.mutatedSlot === i).length),
    clampCounts: {
      low: rows.filter(r => r.clamped === 'low').length,
      high: rows.filter(r => r.clamped === 'high').length,
    },
    variantBirths: rows.filter(r => r.params.some((v, i) => v !== init[i])).length,
    lineages: [...byFounder.entries()].map(([founderId, list]) => ({
      founderId,
      births: list.length,
      delta: EVOLVABLE_PARAMS.map((_, i) => round(mean(list.map(r => r.params[i])) - init[i])),
    })),
  };
};

/** 対照スイープから「適応度が高かった方向」を各形質について決める */
const favorableDirection = (sweep: readonly SweepRow[]): Map<string, { dir: number; best: number; table: [number, number][] }> => {
  const result = new Map<string, { dir: number; best: number; table: [number, number][] }>();
  const byParam = new Map<string, Map<number, number[]>>();
  for (const row of sweep) {
    const key = row.param ?? 'baseline';
    const byValue = byParam.get(key) ?? new Map<number, number[]>();
    const value = row.value ?? -1;
    byValue.set(value, [...(byValue.get(value) ?? []), row.births]);
    byParam.set(key, byValue);
  }
  for (const spec of EVOLVABLE_PARAMS) {
    const byValue = byParam.get(spec.key);
    if (byValue === undefined) continue;
    // baseline（全形質が初期値）の行は初期値の測定として扱う
    const baseline = byParam.get('baseline');
    if (baseline !== undefined) {
      const initSamples = [...baseline.values()].flat();
      if (initSamples.length > 0) byValue.set(spec.init, [...(byValue.get(spec.init) ?? []), ...initSamples]);
    }
    const table: [number, number][] = [...byValue.entries()]
      .map(([value, births]) => [value, round(mean(births))] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    if (table.length === 0) continue;
    const best = table.reduce((a, b) => (b[1] > a[1] ? b : a));
    result.set(spec.key, { dir: Math.sign(best[0] - spec.init), best: best[0], table });
  }
  return result;
};

const main = (): void => {
  const argv = process.argv.slice(2);
  const dir = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : 'docs/experiments/data/09';
  const label = argv.includes('--label') ? argv[argv.indexOf('--label') + 1] : 'evolve-g0';

  const files = readdirSync(dir).filter(f => f.startsWith(`births_${label}_`) && f.endsWith('.jsonl'));
  const bySeed = new Map<number, Birth[]>();
  for (const file of files) {
    const rows = readJsonl<Birth>(`${dir}/${file}`);
    if (rows.length === 0) continue;
    bySeed.set(rows[0].seed, rows);
  }
  const summaries = [...bySeed.values()].map(summarizeSeed).sort((a, b) => a.seed - b.seed);

  // 引きの記録（選択がかかる前）。出生の分布と比べるためにある
  const drawFiles = readdirSync(dir).filter(f => f.startsWith(`draws_${label}_`) && f.endsWith('.jsonl'));
  const draws = drawFiles.flatMap(f => readJsonl<Draw>(`${dir}/${f}`));

  let sweep: SweepRow[] = [];
  try {
    sweep = readJsonl<SweepRow>(`${dir}/sweep.jsonl`);
  } catch {
    sweep = [];
  }
  const favorable = favorableDirection(sweep);

  // --- A1: 創始者と異なる形質を持つ個体が出生・稼働したシードの数 ---
  const a1Seeds = summaries.filter(s => s.variantBirths > 0).length;

  // --- A2: 形質ごとに、移動の符号が対照の有利方向と一致したシードの数 ---
  const a2 = EVOLVABLE_PARAMS.map((spec, i) => {
    const fav = favorable.get(spec.key);
    const agree = summaries.filter(s => fav !== undefined && fav.dir !== 0 && Math.sign(s.delta[i]) === fav.dir).length;
    const agreeNoClamp = summaries.filter(s => fav !== undefined && fav.dir !== 0 && Math.sign(s.deltaNoClamp[i]) === fav.dir).length;
    const lineages = summaries.flatMap(s => s.lineages);
    const lineageAgree = lineages.filter(l => fav !== undefined && fav.dir !== 0 && Math.sign(l.delta[i]) === fav.dir).length;
    return {
      key: spec.key,
      neutral: spec.neutral === true,
      favorableDir: fav?.dir ?? null,
      favorableValue: fav?.best ?? null,
      sweepTable: fav?.table ?? [],
      meanDelta: round(mean(summaries.map(s => s.delta[i]))),
      meanDeltaInSteps: round(mean(summaries.map(s => s.delta[i])) / spec.step, 3),
      seedsAgreeing: agree,
      seedsAgreeingNoClamp: agreeNoClamp,
      lineagesAgreeing: lineageAgree,
      lineageTotal: lineages.length,
      passesA2: agree >= SEED_AGREEMENT_REQUIRED,
    };
  });

  // --- A3: 中立対照 P4 の移動量が、A2 を満たした形質の半分以下か ---
  const neutralIndex = EVOLVABLE_PARAMS.findIndex(p => p.neutral === true);
  const neutralSteps = Math.abs(a2[neutralIndex].meanDeltaInSteps);
  const a2Passing = a2.filter(r => r.passesA2 && !r.neutral);
  const a3 = a2Passing.map(r => ({
    key: r.key,
    paramSteps: Math.abs(r.meanDeltaInSteps),
    neutralSteps,
    ratio: r.meanDeltaInSteps === 0 ? Number.NaN : round(neutralSteps / Math.abs(r.meanDeltaInSteps), 3),
    passesA3: neutralSteps <= NEUTRAL_RATIO_LIMIT * Math.abs(r.meanDeltaInSteps),
  }));

  const slotTotals = EVOLVABLE_PARAMS.map((_, i) => summaries.reduce((acc, s) => acc + s.slotCounts[i], 0));

  /**
   * 引き（選択前）と出生（選択後）の向きの内訳。**この2つの差が選択の効果である。**
   * 引きの段階で既に偏っているなら、それは淘汰ではなく
   * 「表現型 → 乱数の消費 → 引かれる変異」という経路による交絡である。
   * 出生側の帰無仮説は 50:50 ではなく**引きの内訳**であることに注意する
   */
  const allBirths = [...bySeed.values()].flat();
  const directionComparison = EVOLVABLE_PARAMS.map((spec, i) => {
    const drawn = draws.filter(d => d.slot === i);
    const drawUp = drawn.filter(d => d.dir === 1).length;
    const drawDown = drawn.filter(d => d.dir === -1).length;
    const born = allBirths.filter(b => b.mutatedSlot === i && b.paramsBefore !== null);
    const bornUp = born.filter(b => b.params[i] > (b.paramsBefore ?? [])[i]).length;
    const bornDown = born.filter(b => b.params[i] < (b.paramsBefore ?? [])[i]).length;
    const share = (up: number, down: number): number | null =>
      up + down === 0 ? null : round(up / (up + down), 3);
    // 実際に動いた幅の平均。引き（選択前）と出生（選択後）で比べる。
    // **A2 の比較の原点は 0 ではなく、この「引きの平均」である**——引きの段階で既に
    // 偏っているので、0 を原点に置くと交絡を選択と読み違える
    const stepDraws = drawn
      .filter(d => d.valueBefore !== null && d.valueAfter !== null)
      .map(d => (d.valueAfter ?? 0) - (d.valueBefore ?? 0));
    const stepBirths = born.map(b => b.params[i] - (b.paramsBefore ?? [])[i]);
    const meanStepDraw = stepDraws.length === 0 ? null : round(mean(stepDraws) / spec.step, 3);
    const meanStepBirth = stepBirths.length === 0 ? null : round(mean(stepBirths) / spec.step, 3);
    return {
      key: spec.key,
      neutral: spec.neutral === true,
      drawUp, drawDown, drawUpShare: share(drawUp, drawDown),
      bornUp, bornDown, bornUpShare: share(bornUp, bornDown),
      /** 出生の上向き比率 − 引きの上向き比率。これが選択の取り分である */
      selectionShift:
        share(bornUp, bornDown) === null || share(drawUp, drawDown) === null
          ? null
          : round((share(bornUp, bornDown) ?? 0) - (share(drawUp, drawDown) ?? 0), 3),
      /** 1回の変異で動いた幅（刻みを単位とする）。引きと出生の差が選択の取り分 */
      meanStepDraw,
      meanStepBirth,
      meanStepSelection:
        meanStepDraw === null || meanStepBirth === null ? null : round(meanStepBirth - meanStepDraw, 3),
      clampedDraws: drawn.filter(d => d.clamped !== null).length,
      /**
       * 引きの向きが等確率から外れている確率（両側）。小さいほど交絡が強い。
       * **この値が小さい形質については、蓄積した移動量を選択の証拠として使えない**
       */
      drawBiasP: round(binomialTwoSided(drawUp, drawDown), 4),
      drawBalanced: binomialTwoSided(drawUp, drawDown) >= 0.05,
    };
  });

  const verdict = {
    A1: { seedsWithVariants: a1Seeds, required: SEED_AGREEMENT_REQUIRED, passes: a1Seeds >= SEED_AGREEMENT_REQUIRED },
    A2: { passing: a2Passing.map(r => r.key), passes: a2Passing.length > 0 },
    A3: { checks: a3, passes: a3.length > 0 && a3.every(c => c.passesA3) },
  };

  console.log(JSON.stringify({
    label,
    seeds: summaries.length,
    seedsExpected: SEED_TOTAL_EXPECTED,
    perSeed: summaries,
    slotDraws: { counts: slotTotals, chiSquare: round(chiSquareUniform(slotTotals), 3), degreesOfFreedom: EVOLVABLE_PARAMS.length - 1 },
    drawsRecorded: draws.length,
    birthsRecorded: allBirths.length,
    directionComparison,
    sweepAvailable: sweep.length > 0,
    perParam: a2,
    verdict,
    conclusion:
      verdict.A1.passes && verdict.A2.passes && verdict.A3.passes
        ? 'パラメータの進化（最適化）が起きた、と判定する'
        : verdict.A1.passes
          ? '変異は生存したが最適化は示せなかった（中立浮動）'
          : '判定Aは成立しない',
  }, null, 2));
};

main();
