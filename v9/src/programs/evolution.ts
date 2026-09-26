/**
 * 進化する形質（ゲノム上のパラメータ）と、その区画限定変異。
 *
 * 本プロジェクトの制約（R6）により、変異の手法はシミュレータが提供しない。
 * ここにあるのは「祖先種プログラムが自分で実装する変異」を組み立てるコードであり、
 * 出力されるのは個体のプログラム（pmem）に載る命令列である。シミュレータ側は
 * 「子のpmemへ書く」というI/O（0x2001/0x2002）しか提供していない。
 *
 * 実験03の変異はpmem全域への1ビット反転だった。本ファイルの変異はそれと異なり、
 * **PARAM区画の1語だけを ±step 動かす**。コード領域・工程表・持参金表・境界表には
 * アドレス計算上到達できないので、変異は必ず「振る舞いを決める数値の微調整」になる。
 * これは実験03の考察が「プログラムとして書ける」と予告した安全な変異の実装である。
 *
 * メモリ配置（pmem=4096語。コード<2400, 工程表2400-2699, 修理材料表2700-, 拾い上げ表2720-,
 * 持参金表2740-, グローバル2772-2787 の後ろ）:
 *   [PARAM_BASE ..]  進化するパラメータ本体（変異の対象はここだけ）
 *   [PMIN_BASE  ..]  下限表（変異しない）
 *   [PMAX_BASE  ..]  上限表（変異しない）
 *   [PSTEP_BASE ..]  刻み表（変異しない）
 */

import type { ProgramBuilder } from '../vm/program-builder';

export const PARAM_BASE = 2800;
export const PMIN_BASE = 2816;
export const PMAX_BASE = 2832;
export const PSTEP_BASE = 2848;
/**
 * 変異の記録欄。**個体の振る舞いには一切使われない観測用の語**である。
 * 複製のたびに子のコピーへ書き込まれるので、生まれた個体を見れば
 * 「その出生でどのスロットが引かれ、境界で切り詰められたか」が判る。
 *
 * 引いたスロットの度数を後から検定できるようにするために要る。選択式が
 * `(seed >> 3) % PARAM_COUNT` である以上、16bitの値域はスロット数で割り切れず
 * 偏りが出うるからである（式そのものは変えない。偏りは測って報告する）。
 */
export const PLOG_SLOT = 2864;
/** 0=切り詰めなし, 1=下限で切り詰め, 2=上限で切り詰め */
export const PLOG_CLAMP = 2865;
/** 工程表変異で触れた工程の番号 +1（0 = 変異なし） */
export const PLOG_PLAN_STEP = 2866;
/** 工程表変異の種類 +1。1=隣接工程の入替, 2=回数の±1, 3=省略フラグの反転（0 = 変異なし） */
export const PLOG_PLAN_OP = 2867;

/**
 * **引きの記録**（親が自分のメモリに残す欄。子のコピーではない）。
 *
 * PLOG_* は「生まれてきた子」にしか残らない。それだけでは、引きの向きに偏りが出たとき
 * 「不利な向きを引いた子が生まれる前に脱落した（＝選択）」のか
 * 「引きそのものが偏っていた（＝交絡）」のかを分けられない。
 *
 * 交絡を疑う具体的な理由がある。**乱数種は彷徨の方向決めと共用されている**ので、
 * 親がどの時点で複製に至るかで引かれる変異が決まり、そして「いつ複製に至るか」は
 * 親のパラメータ（分散tick数など）が決めている。つまり
 * **表現型 → 乱数の消費 → 引かれる変異** という経路があり、選択が働かなくても
 * パラメータ空間に方向性のある流れが生じうる。
 *
 * そこで、**引いた瞬間に親が自分のメモリへ書く**。観測側は毎tick この欄を読み、
 * 種の値が変わったところを「引きが1回あった」と数える。**子が稼働したかどうかに依らない**ので、
 * 選択がかかる前の引きの分布が取れる。
 */
export const SELFLOG_BASE = 2880;
export const SL_SEED = 0;
export const SL_SLOT = 1;
export const SL_DIR = 2;
export const SL_BEFORE = 3;
export const SL_AFTER = 4;
export const SL_CLAMP = 5;
export const SL_PLAN_STEP = 6;
export const SL_PLAN_OP = 7;
export const SELFLOG_WORDS = 8;

/** 工程表変異の操作の種類。数は3つに限る（事前登録した (a)(b)(c) に対応する） */
export const PLAN_OP_COUNT = 3;

export interface ParamSpec {
  readonly key: string;
  /** 何を決める値かの説明（レポート用） */
  readonly description: string;
  readonly init: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** 個体の振る舞いに影響しない中立対照かどうか */
  readonly neutral?: boolean;
}

/**
 * 進化する形質。初期値はすべて長命移動複製種（longevous.ts）の現行の定数と同一であり、
 * 創始者は現行種と同じ振る舞いをする。
 *
 * neutralDummy はどこからも参照されない語である。変異機構は他の形質と同じ確率でこの語も
 * 動かすが、値は挙動に一切影響しない。したがってこの語に現れる変化の大きさが
 * 「浮動（drift）と創始者効果」そのものであり、他の形質の変化がそれを超えるかどうかが
 * 方向性選択の有無を判定する基準になる（負コントロール）。
 */
export const EVOLVABLE_PARAMS: readonly ParamSpec[] = [
  { key: 'childEnergyDowry', description: '子に渡すエネルギー', init: 900, min: 100, max: 1800, step: 100 },
  { key: 'disperseTicks', description: '複製後に親が子から離れる時間', init: 40, min: 0, max: 200, step: 20 },
  { key: 'repairThreshold', description: 'この耐久度を下回った器官を修理する', init: 600, min: 100, max: 950, step: 50 },
  { key: 'energyForageTarget', description: 'エネルギーをこの量まで貯めてから作業する', init: 1500, min: 600, max: 1950, step: 100 },
  { key: 'neutralDummy', description: '中立対照（どこからも参照されない）', init: 900, min: 100, max: 1800, step: 100, neutral: true },
];

export const PARAM_COUNT = EVOLVABLE_PARAMS.length;

export const paramIndexOf = (key: string): number => {
  const index = EVOLVABLE_PARAMS.findIndex(p => p.key === key);
  if (index < 0) throw new Error(`未定義の形質: ${key}`);
  return index;
};

/** 形質 key の値が置かれる語アドレス */
export const paramAddr = (key: string): number => PARAM_BASE + paramIndexOf(key);

/**
 * ゲノムに形質本体と境界表を書き込む。
 * overrides を渡すと初期値を差し替えられる（対照スイープで固定値を与えるために使う）。
 */
export const writeEvolutionTables = (
  memory: number[],
  overrides: Readonly<Record<string, number>> = {},
): void => {
  EVOLVABLE_PARAMS.forEach((spec, i) => {
    const value = overrides[spec.key] ?? spec.init;
    if (value < spec.min || value > spec.max) {
      throw new Error(`形質 ${spec.key} の初期値が境界外: ${value} ∉ [${spec.min}, ${spec.max}]`);
    }
    memory[PARAM_BASE + i] = value & 0xffff;
    memory[PMIN_BASE + i] = spec.min;
    memory[PMAX_BASE + i] = spec.max;
    memory[PSTEP_BASE + i] = spec.step;
  });
};

/** 個体のpmemから形質の現在値を読み出す（観測用。シミュレーションには影響しない） */
export const readParams = (memory: readonly number[]): readonly number[] =>
  EVOLVABLE_PARAMS.map((_, i) => memory[PARAM_BASE + i] ?? 0);

/**
 * 工程表（行動ブロック列）を対象とする区画限定変異のコードを出力する。判定B用。
 *
 * 工程表は「採取 / クラフト / 組立」のブロックの列であり、固定のインタプリタ（コード領域）が
 * 先頭から順に実行する。つまり**個体の振る舞いの順序と内容を決めているのはこの表**である。
 * ここを変異させると、振る舞いそのものが変わる（順序の依存を壊せば複製に失敗して淘汰される）。
 *
 * 操作は事前登録した3種に限る:
 *   (a) 隣接する2工程の入れ替え
 *   (b) 1工程の回数の ±1（1未満にはしない）
 *   (c) 1工程の省略フラグ（FLAG_OPTIONAL）の反転
 *
 * 書き込み先は `planBase` から `stepCount * stepWords` 語の中だけであり、
 * コード領域・形質区画・持参金表には到達できない。
 *
 * 使用レジスタ: r1,r2（スクラッチ）, r3〜r6。
 */
export const emitPlanMutation = (
  b: ProgramBuilder,
  tag: (name: string) => string,
  opts: {
    seedSlot: number;
    gateMask: number;
    planBase: number;
    stepWords: number;
    stepCount: number;
    /** 省略フラグのビット（longevous.ts の FLAG_OPTIONAL） */
    optionalFlag: number;
  },
): void => {
  const { seedSlot, gateMask, planBase, stepWords, stepCount, optionalFlag } = opts;
  const writeChildImm = childImmWriter(b);
  const writeChildReg = childRegWriter(b);
  const skip = tag('plSkip');
  const opCount = tag('plOpCount');
  const opFlag = tag('plOpFlag');
  const countDec = tag('plCountDec');
  const countWrite = tag('plCountWrite');
  const done = tag('plDone');
  const swapA = tag('plSwapA');
  const swapB = tag('plSwapB');

  writeChildImm(PLOG_PLAN_STEP, 0);
  writeChildImm(PLOG_PLAN_OP, 0);

  b.lw(3, 7, seedSlot);
  b.li(2, 31421).mul(3, 3, 2);
  b.li(2, 6927).add(3, 3, 2);
  b.sw(3, 7, seedSlot);
  // 引きの記録を初期化してから種を残す。観測側は種の変化で「引きが1回あった」と数える
  selfWriteImm(b)(SL_PLAN_STEP, 0);
  selfWriteImm(b)(SL_PLAN_OP, 0);
  selfWriteReg(b)(SL_SEED, 3);
  if (gateMask > 0) {
    b.li(2, 8).shr(4, 3, 2);
    b.li(2, gateMask).and(4, 4, 2);
    b.li(2, 0);
    b.bnelTo(4, 2, skip);
  }

  // r4 = 工程番号 j（入れ替えのため最後の工程は選ばない）, r5 = 操作の種類
  b.li(2, 3).shr(4, 3, 2);
  b.li(2, stepCount - 1).mod(4, 4, 2);
  b.li(2, 12).shr(5, 3, 2);
  b.li(2, PLAN_OP_COUNT).mod(5, 5, 2);

  // r6 = 工程 j の先頭アドレス
  b.li(2, stepWords).mul(6, 4, 2);
  b.li(2, planBase).add(6, 6, 2);

  // 記録（0を「変異なし」に使うので +1 して書く）
  b.addi(4, 4, 1);
  b.li(1, 0x2001).li(2, PLOG_PLAN_STEP).out(1, 2);
  b.li(1, 0x2002).out(1, 4);
  b.addi(5, 5, 1);
  b.li(1, 0x2001).li(2, PLOG_PLAN_OP).out(1, 2);
  b.li(1, 0x2002).out(1, 5);
  // 引きの記録（自分のメモリ。子が稼働したかに依らず残る）
  selfWriteReg(b)(SL_PLAN_STEP, 4);
  selfWriteReg(b)(SL_PLAN_OP, 5);
  b.addi(5, 5, -1);

  b.li(2, 1);
  b.beqlTo(5, 2, opCount);
  b.li(2, 2);
  b.beqlTo(5, 2, opFlag);

  // --- (a) 隣接する2工程を入れ替える ---
  // 子の書き込み先を工程 j の先頭に置き、自動進行ポート(0x2003)で
  // 「工程 j+1 の内容 → 工程 j の内容」の順に 2*stepWords 語を書く。
  // 読み出し元は親自身のメモリで、親は書き換えないのでそのまま読める
  b.li(1, 0x2001).out(1, 6);
  b.li(1, 0x2003);
  b.li(2, stepWords).add(5, 6, 2); // r5 = 工程 j+1 の先頭
  b.li(3, stepWords);
  b.mark(swapA);
  b.lw(4, 5, 0);
  b.out(1, 4);
  b.addi(5, 5, 1);
  b.addi(3, 3, -1);
  b.li(2, 0);
  b.bnelTo(3, 2, swapA);
  b.li(2, 0).add(5, 6, 2); // r5 = 工程 j の先頭
  b.li(3, stepWords);
  b.mark(swapB);
  b.lw(4, 5, 0);
  b.out(1, 4);
  b.addi(5, 5, 1);
  b.addi(3, 3, -1);
  b.li(2, 0);
  b.bnelTo(3, 2, swapB);
  b.jmpTo(done);

  // --- (b) 回数を ±1 する（1未満にはしない） ---
  b.mark(opCount);
  b.addi(6, 6, 1); // 回数欄
  b.lw(4, 6, 0);
  b.li(2, 13).shr(5, 3, 2);
  b.li(2, 1).and(5, 5, 2);
  b.li(2, 0);
  b.beqlTo(5, 2, countDec);
  b.addi(4, 4, 1);
  b.jmpTo(countWrite);
  b.mark(countDec);
  b.li(2, 1);
  b.bgelTo(2, 4, countWrite); // 既に1なら減らさない
  b.addi(4, 4, -1);
  b.mark(countWrite);
  writeChildReg(6, 4);
  b.jmpTo(done);

  // --- (c) 省略フラグを反転する ---
  b.mark(opFlag);
  b.addi(6, 6, 3); // フラグ欄
  b.lw(4, 6, 0);
  b.li(2, optionalFlag);
  b.xor(4, 4, 2);
  writeChildReg(6, 4);

  b.mark(done);
  b.mark(skip);
};

export interface MutationLog {
  /** 引かれた形質の添字。変異が起きなかったなら null */
  readonly mutatedSlot: number | null;
  /** 境界で切り詰められたか */
  readonly clamped: 'low' | 'high' | null;
  /** 工程表変異で触れた工程の番号。触れていなければ null */
  readonly planStep: number | null;
  /** 工程表変異の種類。触れていなければ null */
  readonly planOp: 'swap' | 'count' | 'optional' | null;
}

/** 個体のpmemから、その個体が生まれたときの変異の記録を読み出す（観測用） */
export const readMutationLog = (memory: readonly number[]): MutationLog => {
  const rawSlot = memory[PLOG_SLOT] ?? 0;
  const rawClamp = memory[PLOG_CLAMP] ?? 0;
  const rawStep = memory[PLOG_PLAN_STEP] ?? 0;
  const rawOp = memory[PLOG_PLAN_OP] ?? 0;
  const planOps = ['swap', 'count', 'optional'] as const;
  return {
    mutatedSlot: rawSlot === 0 ? null : rawSlot - 1,
    clamped: rawClamp === 1 ? 'low' : rawClamp === 2 ? 'high' : null,
    planStep: rawStep === 0 ? null : rawStep - 1,
    planOp: rawOp === 0 ? null : (planOps[rawOp - 1] ?? null),
  };
};

export interface DrawLog {
  /** 引いた時点の乱数種。値が変わったことが「引きが1回あった」印になる */
  readonly seed: number;
  /** 引いた形質の添字。ゲートが閉じて変異しなかったら null */
  readonly slot: number | null;
  /** 引いた向き。+1 が増やす、-1 が減らす */
  readonly dir: number | null;
  readonly valueBefore: number | null;
  readonly valueAfter: number | null;
  readonly clamped: 'low' | 'high' | null;
  readonly planStep: number | null;
  readonly planOp: 'swap' | 'count' | 'optional' | null;
}

/**
 * 親が自分のメモリに残した「引きの記録」を読む（観測用）。
 * **子が稼働したかどうかに依らず残る**ので、選択がかかる前の引きの分布が取れる。
 */
export const readDrawLog = (memory: readonly number[]): DrawLog => {
  const at = (offset: number): number => memory[SELFLOG_BASE + offset] ?? 0;
  const rawSlot = at(SL_SLOT);
  const rawDir = at(SL_DIR);
  const rawClamp = at(SL_CLAMP);
  const rawStep = at(SL_PLAN_STEP);
  const rawOp = at(SL_PLAN_OP);
  const planOps = ['swap', 'count', 'optional'] as const;
  return {
    seed: at(SL_SEED),
    slot: rawSlot === 0 ? null : rawSlot - 1,
    dir: rawDir === 0 ? null : rawDir === 2 ? 1 : -1,
    valueBefore: rawSlot === 0 ? null : at(SL_BEFORE),
    valueAfter: rawSlot === 0 ? null : at(SL_AFTER),
    clamped: rawClamp === 1 ? 'low' : rawClamp === 2 ? 'high' : null,
    planStep: rawStep === 0 ? null : rawStep - 1,
    planOp: rawOp === 0 ? null : (planOps[rawOp - 1] ?? null),
  };
};

/**
 * 工程表の指紋。同じ工程表かどうかを1語で比べるために使う（観測用）。
 * 判定Bの「創始者と異なる工程表を持つ個体」の同定と、系統の占有率の計算に使う。
 */
export const planFingerprint = (
  memory: readonly number[],
  planBase: number,
  words: number,
): number => {
  // FNV-1a（32bit）。16bitで畳むと、1工程の入替と1語の書き換えが同じ値になる衝突が実際に出た
  let hash = 0x811c9dc5;
  for (let i = 0; i < words; i++) {
    hash = Math.imul(hash ^ (memory[planBase + i] ?? 0), 0x01000193);
  }
  return hash >>> 0;
};

/** 工程表が基準（創始者）と何語違うか（観測用） */
export const planDiffCount = (
  memory: readonly number[],
  reference: readonly number[],
  planBase: number,
  words: number,
): number => {
  let diff = 0;
  for (let i = 0; i < words; i++) {
    if ((memory[planBase + i] ?? 0) !== (reference[planBase + i] ?? 0)) diff += 1;
  }
  return diff;
};

/** 子のpmemの指定アドレスへ即値を書くコードを出す（親のpmemは触らない） */
const childImmWriter = (b: ProgramBuilder) => (addr: number, value: number): void => {
  b.li(1, 0x2001).li(2, addr).out(1, 2);
  b.li(1, 0x2002).li(2, value).out(1, 2);
};

/** 自分のメモリの絶対アドレスへレジスタの値を書くコードを出す（r1,r2 を潰す） */
const selfWriteReg = (b: ProgramBuilder) => (offset: number, valueReg: number): void => {
  b.li(2, SELFLOG_BASE + offset);
  b.sw(valueReg, 2, 0);
};

/** 自分のメモリの絶対アドレスへ即値を書くコードを出す（r1,r2 を潰す） */
const selfWriteImm = (b: ProgramBuilder) => (offset: number, value: number): void => {
  b.li(2, SELFLOG_BASE + offset);
  b.li(1, value);
  b.sw(1, 2, 0);
};

/** 子のpmemの「レジスタが指すアドレス」へ「レジスタの値」を書くコードを出す */
const childRegWriter = (b: ProgramBuilder) => (addrReg: number, valueReg: number): void => {
  b.li(1, 0x2001).out(1, addrReg);
  b.li(1, 0x2002).out(1, valueReg);
};

/**
 * 区画限定変異のコードを出力する。複製の PHASE D（子へのpmem複写）の直後に置くこと。
 * 呼び出し時点で pmem対象（0x2000）は子Processorに設定済みであることを前提とする。
 *
 * 使用レジスタ: r1,r2（ヘルパのスクラッチ）, r3〜r6。r7 はグローバル基点として温存する。
 *
 * ```
 * seed = seed * 31421 + 6927          16bit LCG。seedはゲノムの一部で子に複製される
 * if ((seed >> 8) & gateMask) != 0: 変異なし
 * i   = (seed >> 3) % PARAM_COUNT     どの形質を動かすか
 * dir = (seed >> 12) & 1              増やすか減らすか
 * v   = clamp(param[i] ± step[i], min[i], max[i])
 * 子のpmem[PARAM_BASE + i] = v        親は無傷
 * ```
 *
 * 判定に seed の上位ビットを使うのは実験03と同じ理由である（LCGの下位ビットは周期が短い）。
 * クランプは境界での折り返しではなく切り詰めであり、しかも**加減算の前に**比較するので、
 * 16bitの巻き上がりが起きない。
 */
export const emitParamMutation = (
  b: ProgramBuilder,
  tag: (name: string) => string,
  opts: { seedSlot: number; gateMask: number },
): void => {
  const skip = tag('pmSkip');
  const writeChildImm = childImmWriter(b);
  const selfImm = selfWriteImm(b);
  const selfReg = selfWriteReg(b);
  const dec = tag('pmDec');
  const incOk = tag('pmIncOk');
  const decOk = tag('pmDecOk');
  const clamped = tag('pmClamped');

  // 記録欄を先に0で潰す。ゲートが閉じたとき親の記録が子に残って見えるのを防ぐ
  writeChildImm(PLOG_SLOT, 0);
  writeChildImm(PLOG_CLAMP, 0);

  // --- 乱数を進める（seedはゲノム上にあるので子にも複製される） ---
  b.lw(3, 7, opts.seedSlot);
  b.li(2, 31421).mul(3, 3, 2);
  b.li(2, 6927).add(3, 3, 2);
  b.sw(3, 7, opts.seedSlot);
  // 引きの記録を初期化してから種を残す。観測側は種の変化で「引きが1回あった」と数えるので、
  // ゲートが閉じて変異しなかった複製も（slot=0 のまま）1件として残る
  selfImm(SL_SLOT, 0);
  selfImm(SL_CLAMP, 0);
  selfReg(SL_SEED, 3);

  if (opts.gateMask > 0) {
    b.li(2, 8).shr(4, 3, 2);
    b.li(2, opts.gateMask).and(4, 4, 2);
    b.li(2, 0);
    b.bnelTo(4, 2, skip);
  }

  // r4 = 形質の添字, r5 = 方向
  b.li(2, 3).shr(4, 3, 2);
  b.li(2, PARAM_COUNT).mod(4, 4, 2);
  b.li(2, 12).shr(5, 3, 2);
  b.li(2, 1).and(5, 5, 2);

  // r6 = step[i], r3 = 現在値
  b.li(2, PSTEP_BASE).add(6, 4, 2).lw(6, 6, 0);
  b.li(2, PARAM_BASE).add(3, 4, 2).lw(3, 3, 0);

  // 引きの記録: どのスロットを・どちら向きに引いたか、変異前の値はいくつか。
  // **子が稼働するより前**に残るので、選択がかかる前の引きの分布が取れる
  b.addi(1, 4, 1);
  selfReg(SL_SLOT, 1);
  b.addi(1, 5, 1);
  selfReg(SL_DIR, 1);
  selfReg(SL_BEFORE, 3);

  b.li(2, 0);
  b.beqlTo(5, 2, dec);

  // --- 増やす: cur <= max - step なら加算、そうでなければ max に切り詰める ---
  b.li(2, PMAX_BASE).add(5, 4, 2).lw(5, 5, 0);
  b.sub(5, 5, 6);
  b.bgelTo(5, 3, incOk);
  b.add(5, 5, 6);
  b.add(3, 5, 0); // r3 = max（r0は常に0）
  writeChildImm(PLOG_CLAMP, 2);
  selfImm(SL_CLAMP, 2);
  b.jmpTo(clamped);
  b.mark(incOk);
  b.add(3, 3, 6);
  b.jmpTo(clamped);

  // --- 減らす: cur >= min + step なら減算、そうでなければ min に切り詰める ---
  b.mark(dec);
  b.li(2, PMIN_BASE).add(5, 4, 2).lw(5, 5, 0);
  b.add(6, 6, 5);
  b.bgelTo(3, 6, decOk);
  b.add(3, 5, 0); // r3 = min
  writeChildImm(PLOG_CLAMP, 1);
  selfImm(SL_CLAMP, 1);
  b.jmpTo(clamped);
  b.mark(decOk);
  b.sub(6, 6, 5);
  b.sub(3, 3, 6);

  b.mark(clamped);
  selfReg(SL_AFTER, 3);
  // --- 子のコピーにだけ書き込む（親のpmemは触らない） ---
  b.li(2, PARAM_BASE).add(5, 4, 2);
  b.li(1, 0x2001).out(1, 5);
  b.li(1, 0x2002).out(1, 3);
  // 引いたスロットを記録する（0は「変異なし」に使うので +1 して書く）
  b.addi(4, 4, 1);
  b.li(1, 0x2001).li(2, PLOG_SLOT).out(1, 2);
  b.li(1, 0x2002).out(1, 4);
  b.mark(skip);
};
