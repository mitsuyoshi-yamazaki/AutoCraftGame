/**
 * 実験09の実行ツール。進化する形質を持つ長命移動複製種を走らせ、
 * 出生記録と個体群の断面を JSONL で書き出す。
 *
 * 使い方:
 *   npx tsx src/tools/evolution-run.ts --mode evolve --seed 26 --ticks 60000
 *   npx tsx src/tools/evolution-run.ts --mode fixed --param childEnergyDowry --value 300 --seed 26
 *
 * シミュレータ側は一切変更していない。ここがやるのは観測（World を読むこと）だけである。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { EXPERIMENTS } from '../experiments';
import type { GameParams } from '../params';
import {
  EVOLVABLE_PARAMS,
  planDiffCount,
  planFingerprint,
  readDrawLog,
  readMutationLog,
  readParams,
} from '../programs/evolution';
import { buildLongevousConfig, DEFAULT_FOUNDERS, PLAN_LAYOUT, PLAN_STEP_TOTAL } from '../programs/longevous';
import { createRng } from '../rng';
import { totalEnergy } from '../sim/accounting';
import { buildInitialWorld } from '../sim/initial-state';
import { ASM_OFF_LAST_PRODUCT } from '../sim/opmem';
import { runTicks } from '../sim/simulation';
import type { ComponentObject, ProcessorComponent, World } from '../sim/types';
import { isWreck } from '../sim/types';

const SNAPSHOT_INTERVAL = 500;
/** 長時間走るので、進捗を標準エラーへ出す（標準出力のJSONは汚さない） */
const PROGRESS_INTERVAL = 5000;

const argsSchema = z.object({
  mode: z.enum(['evolve', 'fixed']),
  seed: z.number().int(),
  ticks: z.number().int().positive(),
  gate: z.number().int().min(0),
  founders: z.number().int().positive(),
  /** fixed モードで固定する形質（省略時は全形質が初期値） */
  param: z.string().optional(),
  value: z.number().int().optional(),
  preset: z.enum(['mobile', 'evolution']),
  /** 何を変異させるか。param=形質区画（判定A） / plan=工程表（判定B） */
  target: z.enum(['param', 'plan']),
  outDir: z.string(),
  label: z.string(),
});
type Args = z.infer<typeof argsSchema>;

const parseArgs = (argv: readonly string[]): Args => {
  const raw: Record<string, unknown> = {
    mode: 'evolve',
    seed: 26,
    ticks: 20000,
    gate: 1,
    founders: DEFAULT_FOUNDERS,
    preset: 'evolution',
    target: 'param',
    outDir: 'docs/experiments/data/09',
    label: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    switch (argv[i]) {
      case '--mode': case '--param': case '--preset': case '--outDir': case '--label': case '--target':
        raw[key] = value; i++; break;
      case '--seed': case '--ticks': case '--gate': case '--value': case '--founders':
        raw[key] = Number(value); i++; break;
      default: break;
    }
  }
  if (raw.label === '') {
    raw.label = raw.mode === 'evolve'
      ? `evolve-${String(raw.target)}-g${String(raw.gate)}`
      : `fixed-${String(raw.param ?? 'init')}-${String(raw.value ?? 'init')}`;
  }
  return argsSchema.parse(raw);
};

/** 個体＝稼働Processor。グループのProcessorを引く */
const processorOfGroup = (world: World, groupId: number | null): ProcessorComponent | undefined => {
  if (groupId === null) return undefined;
  const group = world.objects.find(o => o.kind === 'group' && o.id === groupId);
  if (group === undefined || group.kind !== 'group') return undefined;
  for (const memberId of group.memberIds) {
    const member = world.objects.find(o => o.id === memberId);
    if (member !== undefined && member.kind === 'component' && member.componentType === 'Processor') {
      return member;
    }
  }
  return undefined;
};

const componentById = (world: World, id: number): ComponentObject | undefined => {
  const obj = world.objects.find(o => o.id === id);
  return obj !== undefined && obj.kind === 'component' ? obj : undefined;
};

const aliveProcessors = (world: World): readonly ProcessorComponent[] =>
  world.objects.filter(
    (o): o is ProcessorComponent =>
      o.kind === 'component' && o.componentType === 'Processor' && !isWreck(o) && o.running,
  );

interface BirthRecord {
  readonly tick: number;
  readonly seed: number;
  readonly label: string;
  readonly childId: number;
  readonly parentId: number | null;
  /** どの創始者の系統か。親をたどれなかったら null */
  readonly founderId: number | null;
  readonly generation: number;
  readonly params: readonly number[];
  /**
   * 変異前の形質値（＝親の形質値）。親の形質は生後変わらないので、これが変異前の値である。
   * `params` との差で、引かれた向きと幅を生ログだけから復元できる。
   */
  readonly paramsBefore: readonly number[] | null;
  /** この出生で引かれた形質の添字。変異が起きなかったら null */
  readonly mutatedSlot: number | null;
  /** 境界で切り詰められたか。切り詰めは選択と無関係に平均を動かすので分けて数える */
  readonly clamped: 'low' | 'high' | null;
  /** 工程表変異で触れた工程の番号（判定B） */
  readonly planStep: number | null;
  /** 工程表変異の種類（判定B） */
  readonly planOp: 'swap' | 'count' | 'optional' | null;
  /** 工程表の指紋。創始者と同じなら創始者の値と一致する */
  readonly planFingerprint: number;
  /** 工程表が創始者と何語違うか。0なら「プログラムは変わっていない」 */
  readonly planDiff: number;
}

interface DrawRecord {
  readonly tick: number;
  readonly seed: number;
  readonly label: string;
  /** 引いた親 */
  readonly parentId: number;
  readonly founderId: number | null;
  readonly lcg: number;
  readonly slot: number | null;
  readonly dir: number | null;
  readonly valueBefore: number | null;
  readonly valueAfter: number | null;
  readonly clamped: 'low' | 'high' | null;
  readonly planStep: number | null;
  readonly planOp: 'swap' | 'count' | 'optional' | null;
}

interface Snapshot {
  readonly tick: number;
  readonly seed: number;
  readonly label: string;
  readonly alive: number;
  readonly births: number;
  readonly paramMean: readonly number[];
  readonly storedEnergy: number;
  /**
   * 行動の計数（直前の断面からの増分を、生きている個体数で割ったもの）。
   * **プログラム（工程表）が変わったことと、振る舞いが実際に変わったことは別**なので分けて測る。
   * REPAIR は各コンポーネントの `repairCount` の総和の増分、
   * CRAFT/ASSEMBLE はイベントの数、SCAN は Sensor の摩耗（SCAN1回につき1）から経年分を引いた推定値。
   */
  readonly behavior: {
    readonly craftPerIndividual: number;
    readonly assemblePerIndividual: number;
    readonly repairPerIndividual: number;
    readonly scanPerIndividualEstimated: number;
  };
  /** 工程表の種類ごとの個体数。判定Bの占有率に使う */
  readonly planVariants: Readonly<Record<string, number>>;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;

export interface RunOutcome {
  readonly label: string;
  readonly seed: number;
  readonly mode: string;
  readonly preset: string;
  readonly gate: number;
  readonly param: string | null;
  readonly value: number | null;
  readonly births: number;
  readonly peakAlive: number;
  readonly finalAlive: number;
  readonly unknownParent: number;
  readonly maxGeneration: number;
  readonly birthParamMean: readonly number[];
  /** 引きの総数（選択がかかる前）。出生数より多いのが正常で、差が脱落した子である */
  readonly draws: number;
  readonly drawUp: number;
  readonly drawDown: number;
  readonly extinctAt: number | null;
}

export const runEvolution = (
  args: Args,
  params: GameParams,
): {
  outcome: RunOutcome;
  births: readonly BirthRecord[];
  snapshots: readonly Snapshot[];
  draws: readonly DrawRecord[];
} => {
  const paramOverrides =
    args.param !== undefined && args.value !== undefined ? { [args.param]: args.value } : {};
  // fixed モード（対照）は変異コードそのものを出さない。形質はゲノムから読むので、
  // 進化モードと同じ読み出し経路のまま「変異だけが無い」条件になる
  const config = buildLongevousConfig(args.seed, {
    founders: args.founders,
    evolvable: { target: args.target, gateMask: args.gate, mutate: args.mode === 'evolve', paramOverrides },
  });

  const rng = createRng(args.seed);
  let world = buildInitialWorld({ ...config, seed: args.seed }, params, rng);

  const founderIds = new Set(aliveProcessors(world).map(p => p.id));
  const generationOf = new Map<number, number>();
  /** 個体 → その個体が属する創始者系統。創始者効果を進化と見誤らないために要る */
  const founderOf = new Map<number, number>();
  for (const id of founderIds) {
    generationOf.set(id, 0);
    founderOf.set(id, id);
  }
  const parentOf = new Map<number, number>();

  /** 創始者の工程表。以後の個体の工程表はこれと比べる */
  const founderPlan = aliveProcessors(world)[0].memory;
  const planWords = PLAN_STEP_TOTAL * PLAN_LAYOUT.wordsPerStep;
  const fingerprintOf = (memory: readonly number[]): number =>
    planFingerprint(memory, PLAN_LAYOUT.base, planWords);
  const diffOf = (memory: readonly number[]): number =>
    planDiffCount(memory, founderPlan, PLAN_LAYOUT.base, planWords);

  const births: BirthRecord[] = [];
  const snapshots: Snapshot[] = [];
  /**
   * 引きの記録（選択がかかる**前**）。親が引いた瞬間に自分のメモリへ残した値を毎tick読み、
   * 種が変わったところを1件と数える。出生記録は「生まれてきた子」しか含まないので、
   * この2つを比べないと「引きの偏り」と「選択」を分けられない
   */
  const draws: DrawRecord[] = [];
  const lastDrawSeed = new Map<number, number>();
  let peakAlive = founderIds.size;
  let extinctAt: number | null = null;
  /** 親を特定できなかった出生の数。0でないなら系統の集計は信用できない */
  let unknownParent = 0;
  // 行動の計数。断面ごとに増分を取るので、直前の断面の値を覚えておく
  let craftEvents = 0;
  let assembleEvents = 0;
  let lastCraft = 0;
  let lastAssemble = 0;
  let lastRepairTotal = 0;
  let lastSensorWear = 0;
  let lastSnapshotTick = 0;

  world = runTicks(world, params, rng, args.ticks, result => {
    const w = result.world;
    const tick = w.tick - 1;

    // 親子の対応づけ。ASSEMBLE は craft_completed を出さない（component_created だけ）ので、
    // 生まれたProcessorのIDを last_product に持つAssembler を探す。それが親個体のAssemblerであり、
    // その所属グループのProcessorが親である
    for (const event of result.events) {
      if (event.type === 'craft_completed') craftEvents += 1;
      if (event.type === 'component_created') assembleEvents += 1;
      if (event.type !== 'component_created' || event.componentType !== 'Processor') continue;
      const assembler = w.objects.find(
        o => o.kind === 'component' && o.componentType === 'Assembler' && o.opmem[ASM_OFF_LAST_PRODUCT] === (event.id & 0xffff),
      );
      if (assembler === undefined || assembler.kind !== 'component') continue;
      const parent = processorOfGroup(w, assembler.groupId);
      if (parent !== undefined) parentOf.set(event.id, parent.id);
    }

    for (const event of result.events) {
      if (event.type !== 'processor_started') continue;
      if (founderIds.has(event.id)) continue;
      const child = componentById(w, event.id);
      if (child === undefined || child.componentType !== 'Processor') continue;
      const parentId = parentOf.get(event.id) ?? null;
      const generation = (parentId === null ? 0 : (generationOf.get(parentId) ?? 0)) + 1;
      if (parentId === null) unknownParent += 1;
      generationOf.set(event.id, generation);
      const founderId = parentId === null ? null : (founderOf.get(parentId) ?? null);
      if (founderId !== null) founderOf.set(event.id, founderId);
      const parent = parentId === null ? undefined : componentById(w, parentId);
      births.push({
        tick, seed: args.seed, label: args.label,
        childId: event.id, parentId, founderId, generation,
        params: readParams(child.memory),
        paramsBefore:
          parent !== undefined && parent.componentType === 'Processor' ? readParams(parent.memory) : null,
        ...readMutationLog(child.memory),
        planFingerprint: fingerprintOf(child.memory),
        planDiff: diffOf(child.memory),
      });
    }

    const alive = aliveProcessors(w);

    // 引きの観測。親が引いた瞬間に自分のメモリへ残した種の変化を数える。
    // 初めて見る個体は「今の値」を基準として覚えるだけで、件数には数えない
    for (const processor of alive) {
      const log = readDrawLog(processor.memory);
      const previous = lastDrawSeed.get(processor.id);
      lastDrawSeed.set(processor.id, log.seed);
      if (previous === undefined || previous === log.seed) continue;
      draws.push({
        tick, seed: args.seed, label: args.label,
        parentId: processor.id,
        founderId: founderOf.get(processor.id) ?? null,
        lcg: log.seed,
        slot: log.slot, dir: log.dir,
        valueBefore: log.valueBefore, valueAfter: log.valueAfter,
        clamped: log.clamped, planStep: log.planStep, planOp: log.planOp,
      });
    }

    if (alive.length > peakAlive) peakAlive = alive.length;
    if (alive.length === 0 && extinctAt === null) extinctAt = tick;

    if (tick % PROGRESS_INTERVAL === 0) {
      process.stderr.write(
        `[${args.label} s${args.seed}] tick=${tick} alive=${alive.length} births=${births.length}\n`,
      );
    }
    if (tick % SNAPSHOT_INTERVAL === 0) {
      const genomes = alive.map(p => readParams(p.memory));
      const components = w.objects.filter((o): o is ComponentObject => o.kind === 'component');
      const repairTotal = components.reduce((acc, c) => acc + c.repairCount, 0);
      // SensorはSCAN1回につき1摩耗する。経年（ageInterval ごとに1）を引いた残りをSCAN数とみなす
      const sensors = components.filter(c => c.componentType === 'Sensor' && !isWreck(c));
      const sensorWear = sensors.reduce((acc, c) => acc + (params.maxDurability - c.durability), 0);
      const elapsed = Math.max(1, tick - lastSnapshotTick);
      const perIndividual = (delta: number): number =>
        alive.length === 0 ? 0 : Math.round((delta / alive.length) * 100) / 100;
      const planVariants: Record<string, number> = {};
      for (const processor of alive) {
        const key = String(fingerprintOf(processor.memory));
        planVariants[key] = (planVariants[key] ?? 0) + 1;
      }
      snapshots.push({
        tick, seed: args.seed, label: args.label,
        alive: alive.length,
        births: births.length,
        paramMean: EVOLVABLE_PARAMS.map((_, i) => mean(genomes.map(g => g[i]))),
        storedEnergy: totalEnergy(w),
        behavior: {
          craftPerIndividual: perIndividual(craftEvents - lastCraft),
          assemblePerIndividual: perIndividual(assembleEvents - lastAssemble),
          repairPerIndividual: perIndividual(repairTotal - lastRepairTotal),
          scanPerIndividualEstimated: perIndividual(
            Math.max(0, sensorWear - lastSensorWear - (sensors.length * elapsed) / params.ageInterval),
          ),
        },
        planVariants,
      });
      lastCraft = craftEvents;
      lastAssemble = assembleEvents;
      lastRepairTotal = repairTotal;
      lastSensorWear = sensorWear;
      lastSnapshotTick = tick;
    }
  });

  const finalAlive = aliveProcessors(world).length;
  return {
    outcome: {
      label: args.label, seed: args.seed,
      mode: args.mode, preset: args.preset, gate: args.gate,
      param: args.param ?? null, value: args.value ?? null,
      births: births.length, peakAlive, finalAlive, unknownParent,
      maxGeneration: births.reduce((m, b) => Math.max(m, b.generation), 0),
      birthParamMean: EVOLVABLE_PARAMS.map((_, i) => mean(births.map(b => b.params[i]))),
      draws: draws.length,
      // 引きの向きの内訳（選択がかかる前）。出生記録の内訳と食い違えば、そこに選択が効いている
      drawUp: draws.filter(d => d.dir === 1).length,
      drawDown: draws.filter(d => d.dir === -1).length,
      extinctAt,
    },
    births, snapshots, draws,
  };
};

const writeJsonl = (path: string, rows: readonly unknown[]): void => {
  writeFileSync(path, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length > 0 ? '\n' : ''));
};

const main = (): void => {
  const args = parseArgs(process.argv.slice(2));
  const experiment = EXPERIMENTS.find(e => e.id === (args.preset === 'evolution' ? 'evolution' : 'longevous'));
  if (experiment === undefined) throw new Error(`プリセットが見つからない: ${args.preset}`);
  const started = Date.now();
  const { outcome, births, snapshots, draws } = runEvolution(args, experiment.params);
  mkdirSync(args.outDir, { recursive: true });
  writeJsonl(`${args.outDir}/births_${args.label}_s${args.seed}.jsonl`, births);
  writeJsonl(`${args.outDir}/pop_${args.label}_s${args.seed}.jsonl`, snapshots);
  writeJsonl(`${args.outDir}/draws_${args.label}_s${args.seed}.jsonl`, draws);
  console.log(JSON.stringify({ ...outcome, ticks: args.ticks, elapsedSec: Math.round((Date.now() - started) / 1000) }));
};

main();
