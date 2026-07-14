/**
 * 移動複製種（移動 + 自己複製）。
 *
 * 6部品（Processor + Assembler + Storage + Harvester + Sensor + Actuator）を持ち、
 * 資源を**探索採取**（SCANで探し、Actuatorで移動して接近、Harvesterで採取）してから
 * 6部品の子を組み立て、プログラムを複写して起動し、複製後に**分散**（親子が離れる）する。
 * 子も6部品の移動種なので、系統は局所資源を枯らしても移動して新資源域へ広がれる。
 *
 * 定住種（ancestor.ts）との違いは、資源が近傍に無くても探索で見つけて移動する点。
 * これにより局所枯渇からの脱出＝実験05で定量化されたActuatorの適応価値を実現する。
 */

import { recipeCodeOf, substanceCodeOf, TYPE_CODE_SUBSTANCE_BASE } from '../sim/codes';
import { ProgramBuilder } from '../vm/program-builder';
import { makeHelpers } from './helpers';

// pmem=4096語（params.pmemWords）。コードは大きいのでデータ表はコード領域の上に置く
const PMEM_WORDS = 4096;
const CODE_LIMIT = 1600;
const MATERIALS_BASE = 1600;
const CRAFT_BASE = 1620;
const DOWRY_BASE = 1720;
const GLOBALS_BASE = 1740;

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
// forage/forageEnergyは全レジスタ(r3-r6)を破壊するため、ループ状態はメモリに退避する
const G_LOOPPTR = 12;
const G_LOOPCNT = 13;

// 推進は軽く（コスト=ceil(mag/16)/tick）。低magでも最大速度に届く一方、エネルギー消費を抑える。
// エネルギー探索はランダム歩行で非効率なため、枯渇凍結を避けるには十分な予備が要る。
const THRUST = 64;
// 補給を早めに始めて大きな予備を残す。エネルギー探索はランダム歩行で非効率かつ、
// 0に達するとProcessorが餓死凍結して回復不能なため、予備を厚くして0に近づけない。
const ENERGY_LOW = 1500; // これを下回ったら探索を中断してエネルギー補給
const ENERGY_HIGH = 1950; // 補給時にここまで貯める（容量2000近く。ヒステリシス）
const ENERGY_FORAGE_TARGET = 1500; // クラフト前に確保するエネルギー
const CHILD_ENERGY_DOWRY = 900;
const DISPERSE_TICKS = 40;

/**
 * 探索採取する材料（6部品の子1体分。mobile-plan で算出した正味量に緩衝を加える）。
 * BaseSolid/BindingShardは工程途中で一時的に枯渇しうる（再生産する工程が後段にあるため）。
 * 多めに採取して緩衝を持たせる。余剰は子への持参金になる。
 */
const MATERIALS: ReadonlyArray<readonly [string, number]> = [
  ['BindingShard', 18],
  ['BaseSolid', 9],
  ['InfoSeed', 6],
  ['SignalFluid', 4],
  ['VolatileCore', 3],
  ['CatalystGrain', 2],
];

interface Step {
  readonly recipeId: string;
  readonly count: number;
  readonly assemble: boolean;
  readonly connect?: number; // 接続先グローバルslot
  readonly save?: number; // 生成物lidの保存先グローバルslot
}

/**
 * 27工程。BaseSolid（R21/R10/R26が再生産）とVolatileCore（R24が再生産）が枯渇しないよう、
 * 再生産工程を消費工程の間に挟む順序にして、必要な材料緩衝＝運搬質量を抑える。
 * 最後の6つが6部品の子の組立。
 */
const CRAFT_STEPS: readonly Step[] = [
  { recipeId: 'R1', count: 3, assemble: false }, // BaseSolid-3, →DenseMatrix×3,FlexibleChain×3
  { recipeId: 'R21', count: 1, assemble: false }, // BaseSolid+1（早めに再生産）
  { recipeId: 'R7', count: 3, assemble: false }, // BaseSolid-3, →ConductiveGel×6
  { recipeId: 'R9', count: 2, assemble: false }, // BaseSolid-2, →EncodedFragment×4
  { recipeId: 'R10', count: 2, assemble: false }, // BaseSolid+2, →PatternChain×2
  { recipeId: 'R4', count: 2, assemble: false }, // BaseSolid-2/VolatileCore-2, →ReactiveFragment×4
  { recipeId: 'R26', count: 1, assemble: false }, // BaseSolid+1, →ActiveConductor×2
  { recipeId: 'R23', count: 1, assemble: false }, // VolatileCore-1, →ReactiveCluster×2
  { recipeId: 'R24', count: 1, assemble: false }, // VolatileCore+1, →StabilizedReactor×2
  { recipeId: 'R22', count: 1, assemble: false }, // →ElasticFramework
  { recipeId: 'R25', count: 1, assemble: false }, // →SignalMatrix
  { recipeId: 'R27', count: 1, assemble: false }, // →DataLattice
  { recipeId: 'R28', count: 1, assemble: false }, // →LogicFilament
  { recipeId: 'R30', count: 1, assemble: false }, // →CatalystMatrix
  { recipeId: 'RC8', count: 1, assemble: true, save: G_CHILD_S }, // 子Storage（自由設置）
  { recipeId: 'RC3', count: 1, assemble: true, connect: G_CHILD_S, save: G_CHILD_A }, // 子Assembler
  { recipeId: 'RC7', count: 1, assemble: true, connect: G_CHILD_S }, // 子Harvester
  { recipeId: 'RC1', count: 1, assemble: true, connect: G_CHILD_A, save: G_CHILD_P }, // 子Processor
  { recipeId: 'RC5', count: 1, assemble: true, connect: G_CHILD_S }, // 子Actuator
  { recipeId: 'RC6', count: 1, assemble: true, connect: G_CHILD_S }, // 子Sensor
];

const DOWRY: readonly string[] = ['FlexibleChain', 'ReinforcedMatrix', 'ConductiveGel', 'BindingShard', 'BaseSolid'];

export interface MobileOptions {
  readonly mutation?: boolean;
  readonly mutationGateMask?: number;
  readonly seedSalt?: number;
}

export const buildMobileProgram = (options: MobileOptions = {}): number[] => {
  const b = new ProgramBuilder();
  let tagCounter = 0;
  const tag = (name: string): string => `${name}_${tagCounter++}`;
  const h = makeHelpers(b, tag);

  const forageEnergy = (): void =>
    h.forageEnergy({ sensorSlot: G_SENS, actuatorSlot: G_ACT, harvesterSlot: G_HARV, seedSlot: G_SEED, tmpDirSlot: G_TMPDIR, target: ENERGY_FORAGE_TARGET, thrust: THRUST });

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

  // === PHASE A: 探索採取（forageOneがエネルギーを自己管理する。ループ状態はメモリ退避） ===
  b.li(3, MATERIALS_BASE).sw(3, 7, G_LOOPPTR);
  b.mark('matLoop');
  b.lw(3, 7, G_LOOPPTR);
  b.lw(4, 3, 0); // 種別コード
  b.beqlTo(4, 0, 'matDone');
  b.sw(4, 7, G_WANT);
  b.lw(5, 3, 1);
  b.sw(5, 7, G_LOOPCNT);
  b.mark('matOne');
  h.forageOne({ sensorSlot: G_SENS, actuatorSlot: G_ACT, harvesterSlot: G_HARV, seedSlot: G_SEED, tmpDirSlot: G_TMPDIR, tmpDistSlot: G_TMPDIST, wantSlot: G_WANT, thrust: THRUST, energyLow: ENERGY_LOW, energyHigh: ENERGY_HIGH });
  b.lw(5, 7, G_LOOPCNT);
  b.addi(5, 5, -1);
  b.sw(5, 7, G_LOOPCNT);
  b.li(2, 0);
  b.bnelTo(5, 2, 'matOne');
  b.lw(3, 7, G_LOOPPTR);
  b.addi(3, 3, 2);
  b.sw(3, 7, G_LOOPPTR);
  b.jmpTo('matLoop');
  b.mark('matDone');

  // === PHASE B: クラフト（工程表駆動。forageEnergyがr3-r6を壊すのでptr/cntはメモリ退避） ===
  b.li(3, CRAFT_BASE).sw(3, 7, G_LOOPPTR);
  b.mark('craftLoop');
  b.lw(3, 7, G_LOOPPTR);
  b.lw(4, 3, 0); // recipeCode
  b.beqlTo(4, 0, 'craftDone');
  b.lw(5, 3, 1); // count
  b.sw(5, 7, G_LOOPCNT);
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
  h.extWriteReg(0, 6); // トリガ
  const waitRes = tag('waitRes');
  b.mark(waitRes);
  b.halt();
  h.extRead(7, 6);
  b.beqlTo(6, 0, waitRes);
  b.li(2, 1);
  b.bnelTo(6, 2, 'craftRepeat');
  // 生成物lid保存
  b.lw(6, 3, 3);
  b.li(2, 8).shr(6, 6, 2);
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
  b.lw(3, 7, G_LOOPPTR);
  b.addi(3, 3, 4);
  b.sw(3, 7, G_LOOPPTR);
  b.jmpTo('craftLoop');
  b.mark('craftDone');

  // === PHASE C: 子への転送（エネルギー＋持参金） ===
  forageEnergy();
  h.setTargetFromGlobal(G_STOR);
  b.lw(4, 7, G_CHILD_S);
  h.extWriteLocalId(1, 4);
  h.extWriteImm(2, 0);
  h.extWriteImm(3, CHILD_ENERGY_DOWRY);
  h.extWriteImm(4, 0);
  h.extWriteImm(0, 1);
  b.halt();
  b.li(3, DOWRY_BASE);
  b.mark('dowryLoop');
  b.lw(4, 3, 0);
  b.beqlTo(4, 0, 'dowryDone');
  h.extWriteReg(2, 4);
  h.extWriteImm(3, 99);
  h.extWriteImm(4, 0);
  h.extWriteImm(0, 1);
  b.halt();
  b.addi(3, 3, 1);
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

  if (options.mutation === true) {
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
  h.extWriteReg(1, 4); // direction  (opmem offset1 = magnitude? いや ACT: 0=dir,1=mag)
  // Actuator opmem: 0=direction, 1=magnitude
  b.li(1, 0x1001).li(2, 0).out(1, 2);
  b.li(1, 0x1002).out(1, 4); // direction = ランダム
  b.li(1, 0x1001).li(2, 1).out(1, 2);
  b.li(1, 0x1002).li(2, THRUST).out(1, 2); // magnitude
  b.li(3, DISPERSE_TICKS);
  b.mark('disperse');
  b.halt();
  b.addi(3, 3, -1);
  b.li(2, 0);
  b.bnelTo(3, 2, 'disperse');
  // 停止して次サイクルへ
  b.li(1, 0x1001).li(2, 1).out(1, 2);
  b.li(1, 0x1002).li(2, 0).out(1, 2);

  b.jmpTo('cycle');

  // === データ表 ===
  const code = b.build();
  if (code.length > CODE_LIMIT) {
    throw new Error(`移動複製種のコードが大きすぎる: ${code.length} > ${CODE_LIMIT}`);
  }
  const memory = new Array<number>(PMEM_WORDS).fill(0);
  for (let i = 0; i < code.length; i++) memory[i] = code[i];

  let addr = MATERIALS_BASE;
  for (const [substanceId, count] of MATERIALS) {
    memory[addr++] = TYPE_CODE_SUBSTANCE_BASE + substanceCodeOf(substanceId);
    memory[addr++] = count;
  }
  memory[addr] = 0;

  addr = CRAFT_BASE;
  for (const step of CRAFT_STEPS) {
    memory[addr++] = recipeCodeOf(step.recipeId);
    memory[addr++] = step.count;
    memory[addr++] = step.assemble ? 3 : 2;
    memory[addr++] = (step.connect !== undefined ? step.connect + 1 : 0) | ((step.save !== undefined ? step.save + 1 : 0) << 8);
  }
  memory[addr] = 0;
  if (addr >= DOWRY_BASE) throw new Error(`工程表が持参金表と重なる: ${addr}`);

  addr = DOWRY_BASE;
  for (const substanceId of DOWRY) memory[addr++] = substanceCodeOf(substanceId);
  memory[addr] = 0;

  memory[GLOBALS_BASE + G_SEED] = (options.seedSalt ?? 0) & 0xffff;
  return memory;
};

export const buildMobileConfig = (seed: number, options: MobileOptions = {}, overrides: Record<string, unknown> = {}) => ({
  seed,
  autoNodes: true,
  ancestors: [
    {
      x: 50,
      y: 50,
      cradle: false,
      components: [
        { type: 'Processor' as const, program: buildMobileProgram(options), running: true },
        { type: 'Assembler' as const },
        { type: 'Storage' as const, energy: 1500 },
        { type: 'Harvester' as const },
        { type: 'Sensor' as const },
        { type: 'Actuator' as const },
      ],
      // Storage(2)を中心にA/H/Sensor/Actuatorを別々の辺へ。A接続でStorageの辺4が埋まるので0,1,2を使う
      connections: [
        [0, 1, 0] as [number, number, number], // Processor-Assembler
        [1, 2, 1] as [number, number, number], // Assembler-Storage（Storage側 辺4）
        [2, 3, 0] as [number, number, number], // Storage-Harvester
        [2, 4, 1] as [number, number, number], // Storage-Sensor
        [2, 5, 2] as [number, number, number], // Storage-Actuator
      ],
    },
  ],
  ...overrides,
});
