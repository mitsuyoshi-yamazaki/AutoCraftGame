/**
 * 長命移動複製種（移動 + 自己複製 + 器官の維持）。
 *
 * 能力の構成は移動複製種（mobile.ts）と同じ——移動（Actuator）・資源の認識（Sensor）・
 * 自己複製の6部品である。違いは**器官を修理しながら生きる**ことだけで、その結果として
 * 繁殖能力（寿命 × 生涯の子の数）が高い。
 *
 * 移動複製種が早逝する理由は実測で特定できる（docs/experiments/08 参照）:
 * Sensorは経年劣化に加えてSCANのたびに1摩耗する。探索採取はSCANの連打なので、
 * Sensorは全器官で最も速く（およそ0.4/tick）削れ、Processorの半分以下の時間で残骸になる。
 * Sensorを失った個体は資源もエネルギーも見つけられず、彷徨したまま繁殖せずに死ぬ。
 *
 * 対策はシステム側ではなくプログラム側にある。本種が移動複製種に足したのは次の3点だけである。
 * 1. `maintainGroup` で全器官の耐久度を点検し、閾値を下回った器官をAssemblerのREPAIRで修理する。
 *    点検は**探索の1周ごと**に行う（forageOneのperRound）。希少物質の探索は1個あたり数千tickに
 *    及ぶことがあり、工程の切れ目でしか点検しないとその最中にSensorを失う
 * 2. 修理材料（PatternChain / ConductiveGel / EncodedFragment / ChargedBinder）を
 *    **サイクルの先頭**のキット工程で作る。最後に作ったのでは最初の採取に間に合わない
 * 3. 修理材料を**子に持参金として渡す**。材料は希少資源を要するので、生まれたばかりの個体は
 *    自力で揃える前に感覚器を失う。この戦略は親子2世代にまたがってはじめて成立する
 *
 * REPAIRのコストは修理回数ごとに逓増する（実験04）。したがって本種も不死ではなく、
 * 「修理で寿命を買い、その間に子を増やす」戦略の個体である。
 */

import {
  recipeCodeOf,
  REPAIR_MATERIAL,
  substanceCodeOf,
  TYPE_CODE_BY_COMPONENT,
  TYPE_CODE_SUBSTANCE_BASE,
} from '../sim/codes';
import { STOR_OFF_QUERY_CODE, STOR_OFF_QUERY_COUNT } from '../sim/opmem';
import { COMPONENT_TYPES } from '../sim/types';
import { ProgramBuilder } from '../vm/program-builder';
import { emitParamMutation, emitPlanMutation, paramAddr, writeEvolutionTables } from './evolution';
import { makeHelpers } from './helpers';

// pmem=4096語（params.pmemWords）。維持処理の分だけ移動複製種よりコードが大きい
const PMEM_WORDS = 4096;
const CODE_LIMIT = 2400;
/** 工程表。1工程6語 [コード, 数, 動作, フラグ, 省略条件の物質コード, 省略条件の個数] */
const PLAN_BASE = 2400;
const PLAN_WORDS_PER_STEP = 6;
/** 工程表の配置。実験09の観測（工程表の指紋・差分）が参照する */
export const PLAN_LAYOUT = { base: PLAN_BASE, wordsPerStep: PLAN_WORDS_PER_STEP } as const;
/** コンポーネント種別コード(1-8)を添字に、その器官の修理材料の種別コードを並べた表 */
const REPAIR_MATERIAL_BASE = 2700;
/** 経路上で拾い上げる物質の種別コード表（終端0） */
const PICKUP_BASE = 2720;
const DOWRY_BASE = 2740;
const GLOBALS_BASE = 2780;

// グローバルslot（r7 + slot）
const G_ASM = 0;
const G_HARV = 1;
const G_STOR = 2;
const G_SENS = 3;
const G_ACT = 4;
const G_CHILD_S = 5;
const G_CHILD_A = 6;
const G_CHILD_P = 7;
const G_SEED = 8;
const G_WANT = 9;
const G_TMPDIR = 10;
const G_TMPDIST = 11;
// forage/forageEnergy/maintainGroupは全レジスタ(r3-r6)を破壊するため、ループ状態はメモリに退避する
const G_LOOPPTR = 12;
const G_LOOPCNT = 13;
const G_MAINT_I = 14;
const G_MAINT_N = 15;

// 推進・エネルギー管理は移動複製種と同じ（比較の条件を揃えるため）
const THRUST = 64;
/**
 * 接近・彷徨の1周あたりtick数（移動複製種は既定の2/4）。
 * SCANは1回5エネルギーを消費しSensorを1摩耗させるので、**同じ距離をより少ないSCANで進む**ほど
 * 安く、器官も保つ。推進は周の間ずっと続くため、長くとるほど等速に近づいて直進距離も伸びる
 * （2tickではほぼ加速しきらないうちに向きを変え、ほとんど進まないまま探し直していた）。
 */
const APPROACH_TICKS = 4;
const WANDER_TICKS = 12;
const ENERGY_LOW = 1500;
const ENERGY_HIGH = 1950;
const ENERGY_FORAGE_TARGET = 1500;
const CHILD_ENERGY_DOWRY = 900;
const DISPERSE_TICKS = 40;

/**
 * 修理を発行する耐久度の閾値。REPAIRの回復量は400（params.repairAmount）なので、
 * これを下回ってから修理すれば上限1000を大きく超えず、回復量を捨てない。
 * 修理コストは回数に比例して増えるため、修理の間隔を空けること自体が延命になる。
 */
const REPAIR_THRESHOLD = 600;

interface Step {
  /** FORAGE なら物質ID、CRAFT/ASSEMBLE ならレシピID */
  readonly forage?: string;
  readonly recipeId?: string;
  /** FORAGE は「在庫がこの数に達するまで採る」、CRAFT/ASSEMBLE は実行回数 */
  readonly count: number;
  readonly assemble?: boolean;
  readonly connect?: number; // 接続先グローバルslot
  readonly save?: number; // 生成物lidの保存先グローバルslot
  /** この物質の在庫が skipCount 以上ならこの工程を丸ごと飛ばす（回収品で足りているとき用） */
  readonly skipIf?: readonly [string, number];
  /** 材料不足などで失敗したら、やり直さずに次の工程へ進む */
  readonly optional?: boolean;
}

/** 工程表の action 欄。Assemblerのトリガ値(2=CRAFT, 3=ASSEMBLE)に1=FORAGEを足したもの */
const ACTION_FORAGE = 1;
const ACTION_CRAFT = 2;
const ACTION_ASSEMBLE = 3;
/** フラグ最上位ビット: 失敗を許容する工程 */
const FLAG_OPTIONAL = 0x8000;

/**
 * 経路上で拾い上げる物質。**自然ノードからは採れないが、死んだ個体や修理の排出物として
 * 地面に散らばるもの**を選ぶ。情報原子(I)を含む EncodedFragment / PatternChain / InfoSeed は
 * 世界に1200個しかなく、拾わなければ地面に溜まる一方で、いずれ新しい個体を作れなくなる。
 */
const PICKUP: readonly string[] = [
  'EncodedFragment',
  'PatternChain',
  'InfoSeed',
  'ConductiveGel',
  'ChargedBinder',
];

/**
 * 修理キット工程。**サイクルの先頭に置くことが本種の要点である。**
 *
 * 移動複製種のサイクルは「全材料を探索採取 → クラフト」の順で、採取だけで2500tickかかる。
 * Sensorはその間に摩耗し切って残骸になるので、修理材料をサイクルの最後に作っても間に合わない
 * （実測: 最初の採取フェーズの途中、t≈2500でSensorが死ぬ）。そこで先に修理材料を作り、
 * 以降の長い工程をそれで支える。
 *
 * 生産物: PatternChain×3（Sensor用。最も減る）, EncodedFragment×5（Processor用）,
 * ConductiveGel×6（Harvester/Actuator用）, ChargedBinder×3（Assembler用）, BindingShard（Storage用）。
 * 主な用途は**子へ持たせる分**（DOWRY）である。親自身の分は、修理で排出された摩耗材を
 * 拾い直して再利用するのでほとんど要らない（maintainGroup の回収）。
 */
const KIT_STEPS: readonly Step[] = [
  { forage: 'BindingShard', count: 8 },
  { forage: 'BaseSolid', count: 6 },
  { forage: 'SignalFluid', count: 3 },
  { forage: 'VolatileCore', count: 2 },
  // 情報系は回収品で足りていれば掘らない。InfoSeedは世界の総量が限られた資源である
  { forage: 'InfoSeed', count: 8, skipIf: ['EncodedFragment', 6] },
  { recipeId: 'R9', count: 4, skipIf: ['EncodedFragment', 6] }, // InfoSeed-8/BaseSolid-4, →EncodedFragment×8
  { recipeId: 'R10', count: 3, skipIf: ['PatternChain', 4] }, // EncodedFragment-3/BindingShard-3, →PatternChain×3
  { recipeId: 'R7', count: 3, skipIf: ['ConductiveGel', 5] }, // BaseSolid-3/SignalFluid-3, →ConductiveGel×6
  { recipeId: 'R4', count: 2, skipIf: ['ChargedBinder', 3] }, // BaseSolid-2/VolatileCore-2, →ReactiveFragment×4
  { recipeId: 'R5', count: 3, skipIf: ['ChargedBinder', 3] }, // ReactiveFragment-3/BindingShard-3, →ChargedBinder×3
];

/**
 * 複製工程（採取＋クラフト＋子の組立）。材料の量と27工程の順序は移動複製種と同じで、
 * BaseSolid/VolatileCore の再生産工程を消費工程の間に挟んで運搬質量を抑えている。
 */
const REPLICATION_STEPS: readonly Step[] = [
  { forage: 'BindingShard', count: 18 },
  { forage: 'BaseSolid', count: 9 },
  // 子のProcessorはR28で生のInfoSeedを要する。世界のInfoSeedが尽きたら、回収した
  // EncodedFragmentから情報原子を取り戻す（R20 = I循環の閉路）。材料が無ければ飛ばす
  { recipeId: 'R20', count: 2, skipIf: ['InfoSeed', 6], optional: true },
  { forage: 'InfoSeed', count: 6 },
  { forage: 'SignalFluid', count: 4 },
  { forage: 'VolatileCore', count: 3 },
  { forage: 'CatalystGrain', count: 2 },
  { recipeId: 'R1', count: 3 }, // BaseSolid-3, →DenseMatrix×3,FlexibleChain×3
  { recipeId: 'R21', count: 1 }, // BaseSolid+1（早めに再生産）
  { recipeId: 'R7', count: 3 }, // BaseSolid-3, →ConductiveGel×6
  { recipeId: 'R9', count: 2 }, // BaseSolid-2, →EncodedFragment×4
  { recipeId: 'R10', count: 2 }, // BaseSolid+2, →PatternChain×2
  { recipeId: 'R4', count: 2 }, // BaseSolid-2/VolatileCore-2, →ReactiveFragment×4
  { recipeId: 'R26', count: 1 }, // BaseSolid+1, →ActiveConductor×2
  { recipeId: 'R23', count: 1 }, // VolatileCore-1, →ReactiveCluster×2
  { recipeId: 'R24', count: 1 }, // VolatileCore+1, →StabilizedReactor×2
  { recipeId: 'R22', count: 1 }, // →ElasticFramework
  { recipeId: 'R25', count: 1 }, // →SignalMatrix
  { recipeId: 'R27', count: 1 }, // →DataLattice
  { recipeId: 'R28', count: 1 }, // →LogicFilament
  { recipeId: 'R30', count: 1 }, // →CatalystMatrix
  { recipeId: 'RC8', count: 1, assemble: true, save: G_CHILD_S }, // 子Storage（自由設置）
  { recipeId: 'RC3', count: 1, assemble: true, connect: G_CHILD_S, save: G_CHILD_A }, // 子Assembler
  { recipeId: 'RC7', count: 1, assemble: true, connect: G_CHILD_S }, // 子Harvester
  { recipeId: 'RC1', count: 1, assemble: true, connect: G_CHILD_A, save: G_CHILD_P }, // 子Processor
  { recipeId: 'RC5', count: 1, assemble: true, connect: G_CHILD_S }, // 子Actuator
  { recipeId: 'RC6', count: 1, assemble: true, connect: G_CHILD_S }, // 子Sensor
];

const PLAN_STEPS: readonly Step[] = [...KIT_STEPS, ...REPLICATION_STEPS];

/** 工程表の工程数。実験09の観測（工程表の指紋・差分）が参照する */
export const PLAN_STEP_TOTAL = PLAN_STEPS.length;

/**
 * 子への持参金 [物質, 個数]。先頭の4つが**修理材料の持参金**である。
 *
 * 子も生まれて最初の修理キット工程でInfoSeed（rare）を探し当てるまでに数千tickかかり、
 * その間にSensorを失えば親と同じ早逝に戻る。だから親は自分の修理材料を作るついでに
 * 子の初期分まで作って持たせる（親個体の初期在庫 STARTER_REPAIR_KIT と同じ内容）。
 * 残りは毎サイクル余る構造材で、渡すことで親のStorageが余剰で埋まるのも防ぐ。
 */
const DOWRY: ReadonlyArray<readonly [string, number]> = [
  ['PatternChain', 2],
  ['ConductiveGel', 2],
  ['EncodedFragment', 2],
  ['ChargedBinder', 1],
  ['FlexibleChain', 99],
  ['ReinforcedMatrix', 99],
  ['DenseMatrix', 99],
  ['BindingShard', 6],
  ['BaseSolid', 4],
];

/**
 * 親個体（祖先）のStorageに最初から入れておく修理材料。子が持参金として受け取るものと同じで、
 * 「最初のInfoSeedを見つけるまでSensorを保たせる」ためのもの。初期エネルギー1500と同じ性格の
 * 初期条件であり、以後の世代は親から受け取る。
 */
export const STARTER_REPAIR_KIT: Readonly<Record<string, number>> = {
  PatternChain: 2,
  ConductiveGel: 2,
  EncodedFragment: 2,
  ChargedBinder: 1,
  BindingShard: 2,
};

/**
 * 進化する形質モード（実験09）。指定すると本種は2点だけ変わる。
 * 1. 振る舞いを決める4つの値を、コード中の即値ではなくゲノムのPARAM区画から実行時に読む
 * 2. 複製時の変異を、pmem全域の1ビット反転ではなくPARAM区画限定の ±step 摂動にする
 * 未指定なら生成されるプログラムは1語も変わらない（既存の実験・録画の再現性を保つため）。
 */
export interface EvolvableMode {
  /**
   * 何を変異させるか。
   * - `param`（既定）: 形質区画の1語を ±step 動かす（判定A: パラメータの進化）
   * - `plan`: 工程表の隣接工程の入替・回数の±1・省略フラグの反転（判定B: 振る舞いの進化）
   */
  readonly target?: 'param' | 'plan';
  /** 変異の確率ゲート。0で毎回変異、1で確率1/2、3で1/4 */
  readonly gateMask?: number;
  /**
   * 変異コードを出すかどうか（既定 true）。false にすると形質はゲノムから読むが
   * 複製で一切変異しない。対照実験（形質を固定して適応度地形を測る）で使う。
   */
  readonly mutate?: boolean;
  /** 形質の初期値の差し替え。対照スイープで固定値を与えるために使う */
  readonly paramOverrides?: Readonly<Record<string, number>>;
}

export interface LongevousOptions {
  readonly mutation?: boolean;
  readonly mutationGateMask?: number;
  readonly seedSalt?: number;
  readonly evolvable?: EvolvableMode;
}

/**
 * lw/sw のオフセットは符号つき4bit（-8..+7）である。したがって slot 8 以上は
 * 基点レジスタより**前**のアドレスを指す。グローバルの読み書きは一貫しているので
 * 動作に支障はないが、ビルド時に表を書き込む側はこの規則に合わせる必要がある。
 */
const slotOffset = (slot: number): number => ((slot & 0xf) >= 8 ? (slot & 0xf) - 16 : slot & 0xf);

export interface LongevousConfigOptions extends LongevousOptions {
  /** 初期配置する祖先個体の数（既定 DEFAULT_FOUNDERS）。1にすると単一祖先の対照条件になる */
  readonly founders?: number;
}

/**
 * 祖先個体の初期配置。世界(100×100)を等分する位置に散らし、最初から空間的に分散させる。
 * 1個体だけだと系統の成否がその個体の籤（希少資源をいつ見つけるか）に丸ごと左右されるため、
 * 独立した founder を複数置く。互いに50単位離すので初期の資源競合は起きない。
 */
const FOUNDER_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [25, 25],
  [75, 75],
  [75, 25],
  [25, 75],
  [50, 50],
  [50, 15],
  [15, 50],
  [85, 50],
];

/** 既定の祖先個体数 */
export const DEFAULT_FOUNDERS = 4;

export const buildLongevousProgram = (options: LongevousOptions = {}): number[] => {
  const b = new ProgramBuilder();
  let tagCounter = 0;
  const tag = (name: string): string => `${name}_${tagCounter++}`;
  const h = makeHelpers(b, tag);
  const evolvable = options.evolvable;

  const forageEnergy = (): void =>
    h.forageEnergy({ sensorSlot: G_SENS, actuatorSlot: G_ACT, harvesterSlot: G_HARV, seedSlot: G_SEED, tmpDirSlot: G_TMPDIR, target: ENERGY_FORAGE_TARGET, targetAddr: evolvable === undefined ? undefined : paramAddr('energyForageTarget'), thrust: THRUST, approachTicks: APPROACH_TICKS, wanderTicks: WANDER_TICKS });

  const maintain = (): void =>
    h.maintainGroup({ asmSlot: G_ASM, iSlot: G_MAINT_I, countSlot: G_MAINT_N, threshold: REPAIR_THRESHOLD, thresholdAddr: evolvable === undefined ? undefined : paramAddr('repairThreshold'), harvesterSlot: G_HARV, repairMaterialTable: REPAIR_MATERIAL_BASE });

  // === boot: 自グループ構成の把握と乱数種の非相関化 ===
  b.li(7, GLOBALS_BASE);
  b.li(1, 0x0002).in(3, 1);
  b.lw(5, 7, G_SEED).xor(5, 5, 3).sw(5, 7, G_SEED);
  h.cscanFind(1, G_ASM);
  h.cscanFind(6, G_HARV);
  h.cscanFind(8, G_STOR);
  h.cscanFind(5, G_SENS);
  h.cscanFind(4, G_ACT);

  b.mark('cycle');

  // === PHASE A+B: 工程表インタプリタ（採取とクラフトを1つのループで順に実行する） ===
  // 採取とクラフトを交互に書けるので、修理キットをサイクルの先頭に置ける。
  // ループ状態はメモリ退避（forage/forageEnergy/maintainGroupがr3-r6を破壊するため）
  b.li(3, PLAN_BASE).sw(3, 7, G_LOOPPTR);
  b.mark('planLoop');
  // 工程の切れ目はAssemblerがidleなので、修理を差し込める安全な位置である
  maintain();
  b.lw(3, 7, G_LOOPPTR);
  b.lw(4, 3, 0); // 種別コード or レシピコード
  b.beqlTo(4, 0, 'planDone');

  // --- 省略条件: 指定物質の在庫が足りていれば工程ごと飛ばす（回収品で賄えたとき） ---
  b.lw(4, 3, 4); // 省略条件の物質コード（0なら条件なし）
  b.beqlTo(4, 0, 'noSkip');
  h.setTargetFromGlobal(G_STOR);
  h.extWriteReg(STOR_OFF_QUERY_CODE, 4);
  b.halt(); // 在庫表示は毎tick更新される
  h.extRead(STOR_OFF_QUERY_COUNT, 6);
  b.lw(3, 7, G_LOOPPTR);
  b.lw(5, 3, 5);
  b.bgelTo(6, 5, 'stepDone');
  b.mark('noSkip');

  b.lw(3, 7, G_LOOPPTR);
  b.lw(4, 3, 0);
  b.lw(6, 3, 2); // action
  b.li(2, ACTION_FORAGE);
  b.beqlTo(6, 2, 'forageStep');
  b.lw(5, 3, 1); // クラフト回数
  b.sw(5, 7, G_LOOPCNT);
  b.jmpTo('craftRepeat');

  // --- 探索採取工程: 在庫がその数に達するまで採る（余りは次サイクルの手間を減らす） ---
  b.mark('forageStep');
  b.sw(4, 7, G_WANT);
  b.mark('forageCheck');
  b.lw(3, 7, G_LOOPPTR);
  b.lw(4, 3, 0);
  b.li(2, TYPE_CODE_SUBSTANCE_BASE).sub(4, 4, 2); // 在庫照会は物質コード（種別コードから戻す）
  h.setTargetFromGlobal(G_STOR);
  h.extWriteReg(STOR_OFF_QUERY_CODE, 4);
  b.halt();
  h.extRead(STOR_OFF_QUERY_COUNT, 6);
  b.lw(3, 7, G_LOOPPTR);
  b.lw(5, 3, 1);
  b.bgelTo(6, 5, 'stepDone');
  // Sensorの摩耗は探索採取（SCAN連打）で最も進む。希少物質の探索は数千tickに及ぶので、
  // 工程の切れ目ではなく**探索の1周ごと**に点検する（perRound）。これが本種の生死を分ける
  h.forageOne({ sensorSlot: G_SENS, actuatorSlot: G_ACT, harvesterSlot: G_HARV, seedSlot: G_SEED, tmpDirSlot: G_TMPDIR, tmpDistSlot: G_TMPDIST, wantSlot: G_WANT, thrust: THRUST, energyLow: ENERGY_LOW, energyHigh: ENERGY_HIGH, perRound: maintain, approachTicks: APPROACH_TICKS, wanderTicks: WANDER_TICKS, pickupTable: PICKUP_BASE });
  b.jmpTo('forageCheck');

  // --- クラフト／組立工程 ---
  b.mark('craftRepeat');
  forageEnergy();
  b.lw(3, 7, G_LOOPPTR); // ptr再ロード
  b.lw(4, 3, 0); // recipe再ロード
  h.setTargetFromGlobal(G_ASM);
  h.extRead(8, 6); // configured_recipe
  const cfgOk = tag('cfgOk');
  b.beqlTo(6, 4, cfgOk);
  h.extWriteReg(1, 4);
  h.extWriteImm(0, 1); // SET_RECIPE
  const waitCfg = tag('waitCfg');
  b.mark(waitCfg);
  b.halt();
  h.extRead(8, 6);
  b.bnelTo(6, 4, waitCfg);
  b.mark(cfgOk);
  b.lw(6, 3, 3); // flags
  b.li(2, 255).and(6, 6, 2);
  const noConnect = tag('noConnect');
  const edgeWrite = tag('edgeWrite');
  b.beqlTo(6, 0, noConnect);
  b.addi(6, 6, -1).add(6, 7, 6).lw(2, 6, 0);
  b.li(1, 0x1001).li(6, 2).out(1, 6);
  b.li(1, 0x1005).out(1, 2); // connection_target
  b.jmpTo(edgeWrite);
  b.mark(noConnect);
  h.extWriteImm(2, 0);
  b.mark(edgeWrite);
  h.extWriteImm(3, 0xff); // 辺AUTO
  b.lw(6, 3, 2);
  h.extWriteReg(0, 6); // トリガ（action欄がそのままCRAFT/ASSEMBLEのトリガ値）
  const waitRes = tag('waitRes');
  b.mark(waitRes);
  b.halt();
  h.extRead(7, 6);
  b.beqlTo(6, 0, waitRes);
  b.li(2, 1);
  const craftOk = tag('craftOk');
  b.beqlTo(6, 2, craftOk);
  // 失敗。FLAG_OPTIONAL の工程は材料不足を許容し、次の工程へ進む
  b.lw(6, 3, 3);
  b.li(2, 15).shr(6, 6, 2);
  b.li(2, 0);
  b.bnelTo(6, 2, 'stepDone');
  b.jmpTo('craftRepeat');
  b.mark(craftOk);
  // 生成物lid保存
  b.lw(6, 3, 3);
  b.li(2, 8).shr(6, 6, 2);
  b.li(2, 255).and(6, 6, 2);
  const noSave = tag('noSave');
  b.beqlTo(6, 0, noSave);
  b.addi(6, 6, -1).add(6, 7, 6);
  b.li(1, 0x1001).li(2, 9).out(1, 2);
  b.li(1, 0x1005).in(4, 1);
  b.sw(4, 6, 0);
  b.mark(noSave);
  b.lw(5, 7, G_LOOPCNT);
  b.addi(5, 5, -1);
  b.sw(5, 7, G_LOOPCNT);
  b.li(2, 0);
  b.bnelTo(5, 2, 'craftRepeat');

  b.mark('stepDone');
  b.lw(3, 7, G_LOOPPTR);
  b.addi(3, 3, PLAN_WORDS_PER_STEP);
  b.sw(3, 7, G_LOOPPTR);
  b.jmpTo('planLoop');
  b.mark('planDone');

  // === PHASE C: 子への転送（エネルギー＋持参金[物質, 個数]） ===
  forageEnergy();
  h.setTargetFromGlobal(G_STOR);
  b.lw(4, 7, G_CHILD_S);
  h.extWriteLocalId(1, 4);
  h.extWriteImm(2, 0);
  if (evolvable === undefined) {
    h.extWriteImm(3, CHILD_ENERGY_DOWRY);
  } else {
    // r4（子Storageのlid）は直前の extWriteLocalId で使い終わっているので再利用できる
    b.li(4, paramAddr('childEnergyDowry')).lw(4, 4, 0);
    h.extWriteReg(3, 4);
  }
  h.extWriteImm(4, 0);
  h.extWriteImm(0, 1);
  b.halt();
  b.li(3, DOWRY_BASE);
  b.mark('dowryLoop');
  b.lw(4, 3, 0);
  b.beqlTo(4, 0, 'dowryDone');
  b.lw(5, 3, 1);
  h.extWriteReg(2, 4);
  h.extWriteReg(3, 5);
  h.extWriteImm(4, 0);
  h.extWriteImm(0, 1);
  b.halt();
  b.addi(3, 3, 2);
  b.jmpTo('dowryLoop');
  b.mark('dowryDone');

  // === PHASE D: プログラム複写 ===
  b.lw(2, 7, G_CHILD_P);
  b.li(1, 0x2000).out(1, 2);
  b.li(1, 0x2001).li(2, 0).out(1, 2);
  b.li(3, 0).li(5, PMEM_WORDS);
  b.li(1, 0x2003);
  b.mark('copyLoop');
  b.lw(2, 3, 0);
  b.out(1, 2);
  b.addi(3, 3, 1);
  b.bltlTo(3, 5, 'copyLoop');

  if (evolvable !== undefined) {
    // 実験09: 変異は指定した区画の中だけで起きる（どちらもコード領域には到達できない）
    if (evolvable.mutate !== false) {
      if (evolvable.target === 'plan') {
        emitPlanMutation(b, tag, {
          seedSlot: G_SEED,
          gateMask: evolvable.gateMask ?? 1,
          planBase: PLAN_BASE,
          stepWords: PLAN_WORDS_PER_STEP,
          stepCount: PLAN_STEPS.length,
          optionalFlag: FLAG_OPTIONAL,
        });
      } else {
        emitParamMutation(b, tag, { seedSlot: G_SEED, gateMask: evolvable.gateMask ?? 1 });
      }
    }
  } else if (options.mutation === true) {
    const gateMask = options.mutationGateMask ?? 7;
    const skip = tag('mutSkip');
    b.lw(3, 7, G_SEED);
    b.li(2, 31421).mul(3, 3, 2);
    b.li(2, 6927).add(3, 3, 2);
    b.sw(3, 7, G_SEED);
    if (gateMask > 0) {
      b.li(2, 8).shr(4, 3, 2);
      b.li(2, gateMask).and(4, 4, 2);
      b.li(2, 0);
      b.bnelTo(4, 2, skip);
    }
    b.li(2, 3).shr(4, 3, 2);
    b.li(2, PMEM_WORDS - 1).and(4, 4, 2);
    b.li(2, 13).shr(5, 3, 2);
    b.li(2, 15).and(5, 5, 2);
    b.li(6, 1).shl(5, 6, 5);
    b.lw(6, 4, 0).xor(6, 6, 5);
    b.li(1, 0x2001).out(1, 4);
    b.li(1, 0x2002).out(1, 6);
    b.mark(skip);
  }

  // === PHASE E: 子の起動 ===
  b.lw(2, 7, G_CHILD_P);
  b.li(1, 0x1000).out(1, 2);
  h.extWriteImm(0, 1); // run_flag=1

  // === PHASE F: 分散（親が一定tick移動して子と離れる） ===
  b.lw(3, 7, G_SEED);
  b.li(2, 31421).mul(3, 3, 2);
  b.li(2, 6927).add(3, 3, 2);
  b.sw(3, 7, G_SEED);
  b.li(5, 8).shr(4, 3, 5);
  b.li(5, 255).and(4, 4, 5);
  h.setTargetFromGlobal(G_ACT);
  b.li(1, 0x1001).li(2, 0).out(1, 2);
  b.li(1, 0x1002).out(1, 4); // direction = ランダム
  b.li(1, 0x1001).li(2, 1).out(1, 2);
  b.li(1, 0x1002).li(2, THRUST).out(1, 2); // magnitude
  if (evolvable === undefined) {
    b.li(3, DISPERSE_TICKS);
  } else {
    b.li(3, paramAddr('disperseTicks')).lw(3, 3, 0);
    // 進化した値は0になりうる。0のまま下のdo-whileに入ると65535回まわる
    b.li(2, 0);
    b.beqlTo(3, 2, 'disperseDone');
  }
  b.mark('disperse');
  b.halt();
  b.addi(3, 3, -1);
  b.li(2, 0);
  b.bnelTo(3, 2, 'disperse');
  b.mark('disperseDone');
  // 停止して次サイクルへ
  b.li(1, 0x1001).li(2, 1).out(1, 2);
  b.li(1, 0x1002).li(2, 0).out(1, 2);

  b.jmpTo('cycle');

  // === データ表 ===
  const code = b.build();
  if (code.length > CODE_LIMIT) {
    throw new Error(`長命移動複製種のコードが大きすぎる: ${code.length} > ${CODE_LIMIT}`);
  }
  const memory = new Array<number>(PMEM_WORDS).fill(0);
  for (let i = 0; i < code.length; i++) memory[i] = code[i];

  let addr = PLAN_BASE;
  for (const step of PLAN_STEPS) {
    const action =
      step.forage !== undefined
        ? ACTION_FORAGE
        : step.assemble === true
          ? ACTION_ASSEMBLE
          : ACTION_CRAFT;
    memory[addr++] =
      step.forage !== undefined
        ? TYPE_CODE_SUBSTANCE_BASE + substanceCodeOf(step.forage)
        : recipeCodeOf(step.recipeId ?? '');
    memory[addr++] = step.count;
    memory[addr++] = action;
    memory[addr++] =
      (step.connect !== undefined ? step.connect + 1 : 0) |
      ((step.save !== undefined ? step.save + 1 : 0) << 8) |
      (step.optional === true ? FLAG_OPTIONAL : 0);
    memory[addr++] = step.skipIf !== undefined ? substanceCodeOf(step.skipIf[0]) : 0;
    memory[addr++] = step.skipIf !== undefined ? step.skipIf[1] : 0;
  }
  memory[addr] = 0;
  if (addr >= REPAIR_MATERIAL_BASE) throw new Error(`工程表が修理材料表と重なる: ${addr}`);

  for (const componentType of COMPONENT_TYPES) {
    const code = TYPE_CODE_BY_COMPONENT[componentType];
    memory[REPAIR_MATERIAL_BASE + code] =
      TYPE_CODE_SUBSTANCE_BASE + substanceCodeOf(REPAIR_MATERIAL[componentType]);
  }

  addr = PICKUP_BASE;
  for (const substanceId of PICKUP) memory[addr++] = TYPE_CODE_SUBSTANCE_BASE + substanceCodeOf(substanceId);
  memory[addr] = 0;
  if (addr >= DOWRY_BASE) throw new Error(`拾い上げ表が持参金表と重なる: ${addr}`);

  addr = DOWRY_BASE;
  for (const [substanceId, count] of DOWRY) {
    memory[addr++] = substanceCodeOf(substanceId);
    memory[addr++] = count;
  }
  memory[addr] = 0;
  if (addr >= GLOBALS_BASE) throw new Error(`持参金表がグローバル領域と重なる: ${addr}`);

  if (evolvable === undefined) {
    // 既知の不備（実験09で発見、意図的に未修正）: G_SEED は slot 8 なので、プログラムは
    // slotOffset により GLOBALS_BASE-8 から読む。この行が書いているのは GLOBALS_BASE+8 であり、
    // **既定の長命移動複製種では seedSalt が効いていない**（全創始者が同じ乱数列で始まる）。
    // 直すと既存の実験08と録画シナリオ（seed 5）の結果が変わるため、ここでは直さず記録に留める。
    memory[GLOBALS_BASE + G_SEED] = (options.seedSalt ?? 0) & 0xffff;
  } else {
    // 進化モードでは系統ごとに乱数列を分ける必要があるので、プログラムが実際に読む位置へ書く
    memory[GLOBALS_BASE + slotOffset(G_SEED)] = (options.seedSalt ?? 0) & 0xffff;
    writeEvolutionTables(memory, evolvable.paramOverrides);
  }
  return memory;
};

export const buildLongevousConfig = (
  seed: number,
  options: LongevousConfigOptions = {},
  overrides: Record<string, unknown> = {},
) => {
  const founders = options.founders ?? DEFAULT_FOUNDERS;
  if (founders < 1 || founders > FOUNDER_SPOTS.length) {
    throw new Error(`祖先個体数は1〜${FOUNDER_SPOTS.length}: ${founders}`);
  }
  return {
    seed,
    autoNodes: true,
    // 個体ごとに seedSalt を変える。乱数種が同じだと彷徨の方向まで揃ってしまい、
    // 別々に置いた意味がなくなる（boot時のXORはtickなので全個体で同じ値になる）
    ancestors: FOUNDER_SPOTS.slice(0, founders).map(([x, y], i) => ({
      x,
      y,
      cradle: false,
      components: [
        {
          type: 'Processor' as const,
          program: buildLongevousProgram({ ...options, seedSalt: (options.seedSalt ?? 0) + i + 1 }),
          running: true,
        },
        { type: 'Assembler' as const },
        { type: 'Storage' as const, energy: 1500, items: STARTER_REPAIR_KIT },
        { type: 'Harvester' as const },
        { type: 'Sensor' as const },
        { type: 'Actuator' as const },
      ],
      // 構成・接続は移動複製種と同一（比較の条件を揃えるため）
      connections: [
        [0, 1, 0] as [number, number, number], // Processor-Assembler
        [1, 2, 1] as [number, number, number], // Assembler-Storage（Storage側 辺4）
        [2, 3, 0] as [number, number, number], // Storage-Harvester
        [2, 4, 1] as [number, number, number], // Storage-Sensor
        [2, 5, 2] as [number, number, number], // Storage-Actuator
      ],
    })),
    ...overrides,
  };
};
