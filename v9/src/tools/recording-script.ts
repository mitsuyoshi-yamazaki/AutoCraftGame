/**
 * 録画用の字幕台本を作るツール（ヘッドレス）。
 *
 * 使い方:
 *   npx tsx src/tools/recording-script.ts [--seed N] [--ticks N] [--out <path>] [--survey a,b,c]
 *
 * v9は決定論なので、同じ版・同じ実験・同じシードなら、ここで作った台本の tick は
 * GUI で再生したときの tick と**必ず一致する**。台本はその一致を前提に、
 * 「いつ・どこで・何が起きるか」を先に計算しておくためのものである。
 *
 * 重要: 世界の生成は `experimentById('recording')` 経由で行う。GUI と同じ経路を通さないと、
 * パラメータが分岐したときに台本と実機がずれる（cli.ts はパラメータの複製を持っている）。
 *
 * 検出は**ワールドの差分**で行い、シミュレータには手を入れない。
 * 枯渇＝MatterNodeの消滅、還流＝崩壊由来の地面堆積が減ること、として観測する。
 */

import { writeFileSync } from 'node:fs';
import { experimentById } from '../experiments';
import { createRng } from '../rng';
import { buildInitialWorld } from '../sim/initial-state';
import { executeTick } from '../sim/simulation';
import { SUBSTANCES } from '../craft/substances';
import type { GameParams } from '../params';
import type { ComponentObject, Position, World } from '../sim/types';
import { effectivePosition } from '../sim/world';
import { GAME_VERSION } from '../version';

const EXPERIMENT_ID = 'recording';

/** 字幕の種類。narrative の順に出るのが理想 */
export type CaptionKind = 'birth' | 'growth' | 'depletion' | 'death' | 'decay' | 'reclaim';

const ALL_KINDS: readonly CaptionKind[] = ['birth', 'growth', 'depletion', 'death', 'decay', 'reclaim'];

export interface CaptionEntry {
  readonly tick: number;
  readonly kind: CaptionKind;
  /** 画面に出す英語の文面（録画は英語圏へ送る） */
  readonly text: string;
  /** 強調表示する場所（ワールド座標）。対象が消えたあとも位置は残る */
  readonly x: number;
  readonly y: number;
  readonly objectId: number | null;
  /** 指し示す対象があるか。false なら印を出さず、字幕だけをその座標に置く */
  readonly marker: boolean;
  /** 発生の何秒前から予告を出すか */
  readonly leadSeconds: number;
  /** 発生後に何秒出し続けるか */
  readonly holdSeconds: number;
}

export interface CaptionScript {
  readonly gameVersion: string;
  readonly experimentId: string;
  readonly seed: number;
  readonly ticks: number;
  /** 台本の作り方（第三者が再生成できるように残す） */
  readonly generatedBy: string;
  readonly entries: readonly CaptionEntry[];
}

/**
 * 種類ごとの最大採用数。字幕は「ログの可視化」ではなく解説なので、繰り返さない。
 *
 * depletion（枯渇）は 0 にしてある。資源ノードは残量が減っても表示の下限に張り付くため、
 * 消える瞬間が画面でほとんど読めず、**字幕を出しても何を見ればよいか分からない**。
 * 出来事の検出自体は残してあるので、`--survey` では枯渇の起きるシードかどうかを確認できる。
 */
const MAX_PER_KIND: Readonly<Record<CaptionKind, number>> = {
  birth: 2,
  growth: 1,
  depletion: 0,
  death: 1,
  decay: 1,
  reclaim: 1,
};

/**
 * 同じ種類を2回出すときの、2回目以降の文面。
 * 同じ文が短い間隔で二度出ると「解説」ではなく「ログ」に見えるので、言い方を変える。
 */
const REPEAT_TEXT: Partial<Record<CaptionKind, string>> = {
  birth: 'Another copy starts — replication repeats',
};

/** 字幕どうしが重ならない最小間隔（tick）。前の表示が終わる前に次を出さないため */
const MIN_GAP_TICKS = 400;
const LEAD_SECONDS = 3;
const HOLD_SECONDS = 4;
/** 「増殖」の字幕を出す個体数 */
const GROWTH_POPULATION = 8;

const substanceName = (code: number): string => SUBSTANCES[code - 1]?.id ?? `substance ${code}`;

/** 英語の不定冠詞。物質名は固有の綴りなので母音で始まるかだけを見る */
const article = (word: string): string => ('AEIOU'.includes(word[0]?.toUpperCase() ?? '') ? 'An' : 'A');

interface Candidate extends CaptionEntry {}

interface GroundPile {
  readonly count: number;
  readonly position: Position;
  readonly substanceCode: number;
}

const groundMap = (world: World): Map<number, GroundPile> => {
  const map = new Map<number, GroundPile>();
  for (const obj of world.objects) {
    if (obj.kind === 'ground') {
      map.set(obj.id, { count: obj.count, position: obj.position, substanceCode: obj.substanceCode });
    }
  }
  return map;
};

const nodeMap = (world: World): Map<number, { position: Position; substanceCode: number }> => {
  const map = new Map<number, { position: Position; substanceCode: number }>();
  for (const obj of world.objects) {
    if (obj.kind === 'matterNode') map.set(obj.id, { position: obj.position, substanceCode: obj.substanceCode });
  }
  return map;
};

/** グループの一員は自前の position ではなくグループ基準の位置を使う */
const positionOf = (world: World, id: number): Position | null => {
  const obj = world.objects.find(o => o.id === id);
  if (obj === undefined) return null;
  return obj.kind === 'component' ? effectivePosition(world, obj) : obj.position;
};

/** その座標の採取範囲内にいるコンポーネント（＝拾った個体）を探す */
const harvesterNear = (world: World, position: Position, range: number): ComponentObject | null => {
  let best: ComponentObject | null = null;
  let bestDist = Infinity;
  for (const obj of world.objects) {
    if (obj.kind !== 'component' || obj.componentType !== 'Harvester') continue;
    const d = Math.hypot(obj.position.x - position.x, obj.position.y - position.y);
    if (d <= range && d < bestDist) {
      best = obj;
      bestDist = d;
    }
  }
  return best;
};

const runningProcessors = (world: World): number =>
  world.objects.filter(
    o => o.kind === 'component' && o.componentType === 'Processor' && o.running && o.durability > 0,
  ).length;

/** 1回の走行から字幕の候補をすべて集める */
export const collectCandidates = (seed: number, ticks: number, params: GameParams, build: () => World): Candidate[] => {
  const rng = createRng(seed);
  let world = build();
  const founders = new Set(
    world.objects.filter(o => o.kind === 'component' && o.componentType === 'Processor').map(o => o.id),
  );
  const candidates: Candidate[] = [];
  const entry = (
    tick: number,
    kind: CaptionKind,
    text: string,
    position: Position,
    objectId: number | null,
    marker = true,
  ): void => {
    candidates.push({
      tick,
      kind,
      text,
      x: Math.round(position.x * 10) / 10,
      y: Math.round(position.y * 10) / 10,
      objectId,
      marker,
      leadSeconds: LEAD_SECONDS,
      holdSeconds: HOLD_SECONDS,
    });
  };

  let prevNodes = nodeMap(world);
  let prevGround = groundMap(world);
  /** 崩壊で生じた地面堆積。ここから減ったら「還流」 */
  const corpseDerived = new Map<number, { substanceCode: number; position: Position }>();
  let growthDone = false;

  for (let tick = 0; tick < ticks; tick++) {
    const before = world;
    const result = executeTick(world, params, rng);
    world = result.world;
    let decayedHere = false;

    for (const event of result.events) {
      if (event.type === 'processor_started' && !founders.has(event.id)) {
        const position = positionOf(world, event.id) ?? { x: 0, y: 0 };
        entry(tick, 'birth', 'A new organism starts its program — the copy is alive', position, event.id);
      }
      if (event.type === 'component_wrecked' && event.componentType === 'Processor') {
        const position = positionOf(world, event.id) ?? { x: 0, y: 0 };
        entry(tick, 'death', 'An organism dies — its processor is worn out and stops', position, event.id);
      }
      if (event.type === 'component_removed' && event.cause === 'decayed') {
        const position = positionOf(before, event.id) ?? { x: 0, y: 0 };
        entry(tick, 'decay', 'The wreck collapses — its matter scatters on the ground', position, event.id);
        decayedHere = true;
      }
    }

    // 枯渇: MatterNode が消えた（残量0）
    const nodes = nodeMap(world);
    for (const [id, node] of prevNodes) {
      if (nodes.has(id)) continue;
      entry(
        tick,
        'depletion',
        `${article(substanceName(node.substanceCode))} ${substanceName(node.substanceCode)} deposit is exhausted and disappears`,
        node.position,
        id,
      );
    }
    prevNodes = nodes;

    // 地面堆積の差分。崩壊のあった tick に増えた堆積を「死骸由来」として覚える
    const ground = groundMap(world);
    if (decayedHere) {
      for (const [id, pile] of ground) {
        const prev = prevGround.get(id);
        if (prev === undefined || pile.count > prev.count) {
          corpseDerived.set(id, { substanceCode: pile.substanceCode, position: pile.position });
        }
      }
    }
    // 還流: 死骸由来の堆積が減った＝別の個体が拾っていった
    for (const [id, origin] of corpseDerived) {
      const prev = prevGround.get(id);
      const now = ground.get(id);
      if (prev === undefined) continue;
      const taken = now === undefined ? prev.count > 0 : now.count < prev.count;
      if (!taken) continue;
      const harvester = harvesterNear(world, origin.position, params.proximityRange * 2);
      // 物質の固有名（ChargedBinder など）は見る側に意味がないので一般名で言う
      entry(
        tick,
        'reclaim',
        'Another organism harvests material from the remains',
        origin.position,
        harvester?.id ?? null,
      );
      corpseDerived.delete(id);
    }
    prevGround = ground;

    // 増殖: 個体数が閾値に届いた
    // 増殖は世界全体の話で、指し示す対象が無い。印を出さず、マップ中央に字幕だけを置く
    if (!growthDone && runningProcessors(world) >= GROWTH_POPULATION) {
      growthDone = true;
      entry(
        tick,
        'growth',
        `${GROWTH_POPULATION} organisms are now alive — the lineage is spreading`,
        { x: world.width / 2, y: world.height / 2 },
        null,
        false,
      );
    }
  }
  return candidates;
};

/**
 * 候補から台本を選ぶ。
 * - 種類ごとに MAX_PER_KIND 回まで
 * - 前の採用から MIN_GAP_TICKS 以内は採らない（同時刻の競合は tick 昇順＝先に起きたほうを優先）
 */
export const selectEntries = (candidates: readonly Candidate[]): CaptionEntry[] => {
  const sorted = [...candidates].sort((a, b) => a.tick - b.tick);
  const used = new Map<CaptionKind, number>();
  const selected: CaptionEntry[] = [];
  for (const candidate of sorted) {
    const count = used.get(candidate.kind) ?? 0;
    if (count >= MAX_PER_KIND[candidate.kind]) continue;
    const last = selected[selected.length - 1];
    if (last !== undefined && candidate.tick - last.tick < MIN_GAP_TICKS) continue;
    const repeat = count > 0 ? REPEAT_TEXT[candidate.kind] : undefined;
    selected.push(repeat === undefined ? candidate : { ...candidate, text: repeat });
    used.set(candidate.kind, count + 1);
  }
  return selected;
};

const buildScript = (seed: number, ticks: number): { script: CaptionScript; candidates: Candidate[] } => {
  const experiment = experimentById(EXPERIMENT_ID);
  if (experiment.id !== EXPERIMENT_ID) throw new Error(`実験 ${EXPERIMENT_ID} が登録されていない`);
  const build = (): World => buildInitialWorld(experiment.build(seed), experiment.params, createRng(seed));
  const candidates = collectCandidates(seed, ticks, experiment.params, build);
  return {
    script: {
      gameVersion: GAME_VERSION.toString(),
      experimentId: EXPERIMENT_ID,
      seed,
      ticks,
      generatedBy: 'npx tsx src/tools/recording-script.ts',
      entries: selectEntries(candidates),
    },
    candidates,
  };
};

const parseArgs = (argv: string[]) => {
  let seed: number | undefined;
  let ticks = 12000;
  let out = 'ui/recording-captions.json';
  let survey: number[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') seed = Number(argv[++i]);
    else if (argv[i] === '--ticks') ticks = Number(argv[++i]);
    else if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--survey') survey = argv[++i].split(',').map(Number);
  }
  return { seed, ticks, out, survey };
};

const main = (): void => {
  const { seed, ticks, out, survey } = parseArgs(process.argv.slice(2));
  if (survey.length > 0) {
    // シード選び: 6現象がすべて・順序よく・短い tick で出るものを探す
    for (const s of survey) {
      const { script, candidates } = buildScript(s, ticks);
      const first = new Map<CaptionKind, number>();
      for (const c of candidates) if (!first.has(c.kind)) first.set(c.kind, c.tick);
      const missing = ALL_KINDS.filter(k => !first.has(k));
      const last = script.entries[script.entries.length - 1]?.tick ?? 0;
      console.log(
        `seed=${s} 採用${script.entries.length}件 最終tick=${last} 起きなかった現象=${missing.length === 0 ? 'なし' : missing.join(',')}`,
      );
      console.log(`    現象の初出: ${ALL_KINDS.map(k => `${k}=${first.get(k) ?? '-'}`).join(' ')}`);
      for (const e of script.entries) console.log(`    採用 t=${e.tick} ${e.kind} @(${e.x},${e.y})`);
    }
    return;
  }
  const experiment = experimentById(EXPERIMENT_ID);
  const { script } = buildScript(seed ?? experiment.defaultSeed, ticks);
  writeFileSync(out, `${JSON.stringify(script, null, 2)}\n`, 'utf-8');
  console.log(`台本を書き出した: ${out}（${script.entries.length}件 / seed=${script.seed} / v${script.gameVersion}）`);
  for (const e of script.entries) console.log(`  t=${e.tick} ${e.kind} @(${e.x},${e.y}) ${e.text}`);
};

// テストから純粋関数（selectEntries）だけを読めるよう、直接起動のときだけ実行する
if (process.argv[1]?.includes('recording-script')) main();
