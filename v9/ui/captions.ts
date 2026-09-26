/**
 * 録画用の字幕プレイヤー。
 *
 * 字幕は**ログの可視化ではなく解説**である。したがって:
 * - 種類ごとに数回だけ出す（間引きは台本側で済ませてある）
 * - 一度に一つだけ出し、前の字幕が読める時間を確保してから次に移る
 * - 崩壊のように対象が消える出来事は、起きてから出しても目撃できないので**予告してから**出す
 *
 * 台本（`recording-captions.json`）はヘッドレスで先に走らせて作る（`src/tools/recording-script.ts`）。
 * v9は決定論なので、同じ版・実験・シードなら台本のtickと実機のtickは一致する。
 * 一致しない組み合わせでは字幕を出さず、その旨を表示する（ずれた字幕は嘘になるため）。
 *
 * 秒⇄tickの換算には**実測のtick速度**を使う。UIは1コールバック1tickで描画も挟むため、
 * 要求tick/sは上限の希望でしかなく、実際は下振れする。
 */

export type CaptionKind = 'birth' | 'growth' | 'depletion' | 'death' | 'decay' | 'reclaim';

export interface CaptionEntry {
  readonly tick: number;
  readonly kind: CaptionKind;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly objectId: number | null;
  /** 指し示す対象があるか。false なら印を出さず、字幕だけをその座標に置く */
  readonly marker: boolean;
  readonly leadSeconds: number;
  readonly holdSeconds: number;
}

export interface CaptionScript {
  readonly gameVersion: string;
  readonly experimentId: string;
  readonly seed: number;
  readonly ticks: number;
  readonly generatedBy: string;
  readonly entries: readonly CaptionEntry[];
}

export interface ActiveCaption {
  readonly entry: CaptionEntry;
  /** 発生前（予告中）なら true。UI は淡く出し、印を明滅させる */
  readonly pending: boolean;
}

/** 次の字幕へ移る前に、最低これだけは出し続ける（実時間・ミリ秒） */
const MIN_VISIBLE_MS = 2000;
/**
 * 発生した瞬間から、最低これだけは「発生後」の見た目で出し続ける。
 * これが無いと、出来事が密に続くとき（死→崩壊のように）予告のまま次へ譲ってしまい、
 * 肝心の瞬間を淡い予告表示のまま通り過ぎる。
 */
const MIN_LIVE_MS = 1500;
/** 実測tick速度の平均に使う標本数 */
const RATE_SAMPLES = 40;
/** 台本が無い・合わないときの既定 */
const FALLBACK_TPS = 30;

export class CaptionPlayer {
  private script: CaptionScript | null = null;
  private mismatch: string | null = null;
  private nextIndex = 0;
  private active: { entry: CaptionEntry; shownAt: number; firedAt: number | null } | null = null;
  private tickStamps: number[] = [];

  /** 台本を読み込む。実験・シード・版が合わないときは字幕を出さない */
  load(script: CaptionScript, experimentId: string, seed: number, gameVersion: string): void {
    this.reset();
    if (script.experimentId !== experimentId || script.seed !== seed) {
      this.mismatch = `台本は ${script.experimentId} / seed ${script.seed} 用です（今は ${experimentId} / seed ${seed}）`;
      return;
    }
    if (script.gameVersion !== gameVersion) {
      this.mismatch = `台本は v${script.gameVersion} で作られています（今は v${gameVersion}）。作り直してください`;
      return;
    }
    this.script = script;
  }

  clear(): void {
    this.reset();
  }

  private reset(): void {
    this.script = null;
    this.mismatch = null;
    this.nextIndex = 0;
    this.active = null;
    this.tickStamps = [];
  }

  /** 巻き戻し（リセット）に追従する */
  rewind(): void {
    this.nextIndex = 0;
    this.active = null;
    this.tickStamps = [];
  }

  get notice(): string | null {
    return this.mismatch;
  }

  get loaded(): boolean {
    return this.script !== null;
  }

  /** 直近の実測tick速度（tick/s） */
  get measuredTps(): number {
    if (this.tickStamps.length < 2) return FALLBACK_TPS;
    const span = this.tickStamps[this.tickStamps.length - 1] - this.tickStamps[0];
    if (span <= 0) return FALLBACK_TPS;
    return ((this.tickStamps.length - 1) * 1000) / span;
  }

  /** 1tickごとに呼ぶ。now は実時間（ミリ秒） */
  update(tick: number, now: number): void {
    if (this.script === null) return;
    this.tickStamps.push(now);
    if (this.tickStamps.length > RATE_SAMPLES) this.tickStamps.shift();

    const entries = this.script.entries;
    const tps = this.measuredTps;

    // 表示中の字幕の期限を見る
    if (this.active !== null) {
      const { entry, shownAt, firedAt } = this.active;
      if (firedAt === null && tick >= entry.tick) {
        this.active = { entry, shownAt, firedAt: now };
      }
      const fired = this.active.firedAt;
      const expired = fired !== null && now - fired >= entry.holdSeconds * 1000;
      const readable = now - shownAt >= MIN_VISIBLE_MS;
      // 次の出番が来ているなら、読める時間を確保したうえで譲る
      const nextDue =
        this.nextIndex < entries.length &&
        tick >= entries[this.nextIndex].tick - entries[this.nextIndex].leadSeconds * tps;
      const livedEnough = fired !== null && now - fired >= MIN_LIVE_MS;
      if ((expired && readable) || (nextDue && readable && livedEnough)) {
        this.active = null;
      } else {
        return;
      }
    }

    // 出番の来た字幕を1つだけ拾う。行き過ぎた（見逃した）ものは捨てる
    while (this.nextIndex < entries.length) {
      const entry = entries[this.nextIndex];
      const leadTicks = entry.leadSeconds * tps;
      if (tick < entry.tick - leadTicks) return;
      this.nextIndex += 1;
      // 発生からholdの分だけ過ぎていたら、もう見せる意味がない
      if (tick > entry.tick + entry.holdSeconds * tps) continue;
      this.active = { entry, shownAt: now, firedAt: tick >= entry.tick ? now : null };
      return;
    }
  }

  get current(): ActiveCaption | null {
    if (this.active === null) return null;
    return { entry: this.active.entry, pending: this.active.firedAt === null };
  }
}

/** 台本を読む。置いていない場合は null（字幕なしで動く） */
export const fetchCaptionScript = async (url: string): Promise<CaptionScript | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as CaptionScript;
  } catch {
    return null;
  }
};
