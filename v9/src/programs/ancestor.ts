/**
 * 祖先種プログラム — 最小祖先（Processor + Assembler + Storage + Harvester）の自己複製。
 *
 * サイクル: 起動時にCSCANで自グループの構成を知る → 材料を選択回収 →
 * クラフト工程表に従い中間物質と子コンポーネント4種を組立 → 子Storageへ
 * エネルギーと余剰材料（持参金）を転送 → 自pmem全体を子Processorへ複写 →
 * （変異版: プログラム内実装のLCGで子のコピーにのみビット反転を注入）→
 * 子のrun_flagを立てて起動 → 先頭へループ。
 *
 * システムは複写・書込のI/Oという物理法則のみ提供し、複製の手順も変異の方針も
 * すべて本プログラムが実装している（R1/R2/R6）。
 *
 * メモリレイアウト:
 *   [0..CODE_LIMIT)      コード
 *   [MATERIALS_BASE..]   材料表 (filterCode, count)*, 0
 *   [CRAFT_BASE..]       工程表 (recipeCode, count, trigger, connect|save<<8)*, 0
 *   [DOWRY_BASE..]       持参金表 (substanceCode, amount)*, 0
 *   [GLOBALS_BASE..]     実行時グローバル（lid等。r7が常にこの領域を指す）
 */

import { recipeCodeOf, substanceCodeOf, TYPE_CODE_SUBSTANCE_BASE } from '../sim/codes';
import { ProgramBuilder } from '../vm/program-builder';

const CODE_LIMIT = 768;
const MATERIALS_BASE = 768;
const CRAFT_BASE = 788;
const DOWRY_BASE = 872;
const GLOBALS_BASE = 960;

// グローバルスロット（r7 + slot でアクセス）
const G_MY_ASM = 0;
const G_MY_HARV = 1;
const G_MY_STOR = 2;
const G_CHILD_S = 3;
const G_CHILD_A = 4;
const G_CHILD_P = 5;
const G_SEED = 6;

const ENERGY_LOW = 1200;
const CHILD_ENERGY_DOWRY = 800;

export interface AncestorOptions {
  /** 変異を有効にする。mutationGateMask=0で毎回変異（テスト用）、7で確率1/8 */
  readonly mutation?: boolean;
  readonly mutationGateMask?: number;
  /**
   * LCGの初期種。ゲノム（pmem）の一部として子に複製される。
   * 創始者は常にtick0で起動するため、これを変えることで系統ごとに変異スケジュールが変わる
   */
  readonly seedSalt?: number;
}

interface CraftStep {
  readonly recipeId: string;
  readonly count: number;
  readonly assemble: boolean;
  readonly connectFrom?: number; // 接続先のグローバルスロット
  readonly saveTo?: number; // 生成物lidの保存先グローバルスロット
}

/** 材料表: craft:reportの最小祖先生産計画と一致させる */
const MATERIALS: ReadonlyArray<readonly [string, number]> = [
  ['BaseSolid', 5],
  ['BindingShard', 12],
  ['InfoSeed', 5],
  ['VolatileCore', 2],
  ['CatalystGrain', 1],
  ['SignalFluid', 1],
];

/**
 * 工程表: 接続依存（子Storage → 子Assembler → 子Harvester/Processor）と
 * 材料収支（R10のBaseSolid副産物をR7が使う）を満たす順序。
 * BaseSolid収支: 5 → R1×3(-3) → R21(+1) → R4(-1) → R9×2(-2) → R10(+1) → R7(-1) → 0
 */
const CRAFT_STEPS: readonly CraftStep[] = [
  { recipeId: 'R1', count: 3, assemble: false },
  { recipeId: 'R21', count: 1, assemble: false },
  { recipeId: 'RC8', count: 1, assemble: true, saveTo: G_CHILD_S }, // 子Storage（自由設置）
  { recipeId: 'R4', count: 1, assemble: false },
  { recipeId: 'R23', count: 1, assemble: false },
  { recipeId: 'R24', count: 1, assemble: false },
  { recipeId: 'R30', count: 1, assemble: false },
  { recipeId: 'RC3', count: 1, assemble: true, connectFrom: G_CHILD_S, saveTo: G_CHILD_A },
  { recipeId: 'R9', count: 2, assemble: false },
  { recipeId: 'R27', count: 1, assemble: false },
  { recipeId: 'R10', count: 1, assemble: false },
  { recipeId: 'R28', count: 1, assemble: false },
  { recipeId: 'R7', count: 1, assemble: false },
  { recipeId: 'RC7', count: 1, assemble: true, connectFrom: G_CHILD_S },
  { recipeId: 'RC1', count: 1, assemble: true, connectFrom: G_CHILD_A, saveTo: G_CHILD_P },
];

/** 持参金: サイクルの余剰材料を子へ渡す（親Storageの容量管理を兼ねる） */
const DOWRY: readonly string[] = [
  'FlexibleChain',
  'EncodedFragment',
  'VolatileCore',
  'ConductiveGel',
  'ReinforcedMatrix',
  'BaseSolid',
  'BindingShard',
];

export const buildAncestorProgram = (options: AncestorOptions = {}): number[] => {
  const b = new ProgramBuilder();
  let tagCounter = 0;
  const tag = (name: string): string => `${name}_${tagCounter++}`;

  // --- ヘルパ（emit時に展開される） ---

  /** 外部opmemのオフセットへ即値を書く */
  const extWriteImm = (offset: number, value: number): void => {
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1002).li(2, value).out(1, 2);
  };

  /** r1/r2はヘルパのスクラッチなので値渡しに使えない */
  const assertDataReg = (reg: number): void => {
    if (reg === 1 || reg === 2) {
      throw new Error(`r${reg}はヘルパのスクラッチレジスタ（値はr3〜r6で渡すこと）`);
    }
  };

  /** 外部opmemのオフセットへレジスタ値を書く */
  const extWriteReg = (offset: number, reg: number): void => {
    assertDataReg(reg);
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1002).out(1, reg);
  };

  /** 外部opmemのオフセットへローカルID変換付きで書く（0x1005） */
  const extWriteLocalId = (offset: number, reg: number): void => {
    assertDataReg(reg);
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1005).out(1, reg);
  };

  /** 外部opmemのオフセットを読む */
  const extRead = (offset: number, rd: number): void => {
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1002).in(rd, 1);
  };

  /** 外部対象をグローバルのlidに設定する */
  const setTargetFromGlobal = (slot: number): void => {
    b.lw(2, 7, slot);
    b.li(1, 0x1000).out(1, 2);
  };

  /**
   * エネルギーが下限を切っていたらEnergyNodeから回収する（満ちるまでループ）。
   * clobbers: r1, r2, r6
   */
  const ensureEnergy = (): void => {
    const check = tag('eeCheck');
    const done = tag('eeDone');
    b.mark(check);
    b.li(1, 0x0004).in(6, 1); // GROUP_ENERGY
    b.li(2, ENERGY_LOW);
    b.bgelTo(6, 2, done);
    setTargetFromGlobal(G_MY_HARV);
    extWriteImm(2, 0); // result=0
    extWriteImm(1, 20); // filter=エネルギー
    extWriteImm(0, 1); // trigger
    b.halt();
    b.jmpTo(check);
    b.mark(done);
  };

  // ============================================================
  // boot: 乱数種の非相関化と自グループ構成の把握
  // ============================================================
  b.li(7, GLOBALS_BASE);
  // seed ^= 現在tick（系統ごとに乱数列を分ける）
  b.li(1, 0x0002).in(3, 1);
  b.lw(5, 7, G_SEED).xor(5, 5, 3).sw(5, 7, G_SEED);

  // CSCANで各コンポーネントのlidを取得する（filter=種別コード、entry0を読む）
  const cscanFind = (filterCode: number, slot: number): void => {
    b.li(1, 0x0102).li(2, filterCode).out(1, 2); // cscan_filter
    b.li(1, 0x0101).li(2, 1).out(1, 2); // cscan_trigger
    b.halt(); // アクションフェーズでCSCAN実行 → 次tickに結果
    b.li(1, 0x0104).in(3, 1); // 結果entry0のlid
    b.sw(3, 7, slot);
  };
  cscanFind(1, G_MY_ASM);
  cscanFind(6, G_MY_HARV);
  cscanFind(8, G_MY_STOR);

  // ============================================================
  // cycle: 複製サイクル先頭
  // ============================================================
  b.mark('cycle');

  // --- PHASE A: 材料回収（材料表駆動・失敗リトライつき） ---
  b.li(3, MATERIALS_BASE);
  b.mark('matLoop');
  b.lw(4, 3, 0); // filterCode
  b.beqlTo(4, 0, 'matDone');
  b.lw(5, 3, 1); // count
  b.mark('matOne');
  ensureEnergy();
  setTargetFromGlobal(G_MY_HARV);
  extWriteImm(2, 0); // result=0
  extWriteReg(1, 4); // filter=対象物質
  extWriteImm(0, 1); // trigger
  b.halt();
  extRead(2, 6); // result
  b.li(2, 1);
  b.bnelTo(6, 2, 'matOne'); // 失敗 → リトライ
  b.addi(5, 5, -1);
  b.li(2, 0);
  b.bnelTo(5, 2, 'matOne');
  b.addi(3, 3, 2);
  b.jmpTo('matLoop');
  b.mark('matDone');

  // --- PHASE B: クラフト（工程表駆動） ---
  b.li(3, CRAFT_BASE);
  b.mark('craftLoop');
  b.lw(4, 3, 0); // recipeCode
  b.beqlTo(4, 0, 'craftDone');
  b.lw(5, 3, 1); // count
  b.mark('craftRepeat');
  ensureEnergy();
  setTargetFromGlobal(G_MY_ASM);
  // 構成済みレシピの確認（未構成ならSET_RECIPEして待つ）
  extRead(8, 6); // configured_recipe
  const cfgOk = tag('cfgOk');
  b.beqlTo(6, 4, cfgOk);
  extWriteReg(1, 4); // recipe_code
  extWriteImm(0, 1); // SET_RECIPE
  const waitCfg = tag('waitCfg');
  b.mark(waitCfg);
  b.halt();
  extRead(8, 6);
  b.bnelTo(6, 4, waitCfg);
  b.mark(cfgOk);
  // 接続パラメータ（ASSEMBLE用。CRAFTでは無視される）
  b.lw(6, 3, 3); // flags = connect | save<<8
  b.li(2, 255).and(6, 6, 2);
  const noConnect = tag('noConnect');
  const edgeWrite = tag('edgeWrite');
  b.beqlTo(6, 0, noConnect);
  b.addi(6, 6, -1).add(6, 7, 6).lw(2, 6, 0); // r2 = 接続先lid（グローバル）
  b.li(1, 0x1001).li(6, 2).out(1, 6);
  b.li(1, 0x1005).out(1, 2); // connection_target（lid→生ID変換書込）
  b.jmpTo(edgeWrite);
  b.mark(noConnect);
  extWriteImm(2, 0); // 自由設置
  b.mark(edgeWrite);
  extWriteImm(3, 0xff); // 辺AUTO
  // トリガ（2=CRAFT / 3=ASSEMBLE）
  b.lw(6, 3, 2);
  extWriteReg(0, 6);
  // 完了待ち（result: 0=進行中, 1=成功, その他=失敗）
  const waitRes = tag('waitRes');
  b.mark(waitRes);
  b.halt();
  extRead(7, 6);
  b.beqlTo(6, 0, waitRes);
  b.li(2, 1);
  b.bnelTo(6, 2, 'craftRepeat'); // 失敗 → エネルギー確認からリトライ
  // 生成物lidの保存（save指定つき工程。countは1である前提）
  b.lw(6, 3, 3);
  b.li(2, 8).shr(6, 6, 2);
  const noSave = tag('noSave');
  b.beqlTo(6, 0, noSave);
  b.addi(6, 6, -1).add(6, 7, 6); // r6 = グローバル格納先アドレス
  // last_product（offset9）をlid変換つきで読む（r4を一時利用。count=1なので安全）
  b.li(1, 0x1001).li(2, 9).out(1, 2);
  b.li(1, 0x1005).in(4, 1);
  b.sw(4, 6, 0);
  b.mark(noSave);
  b.addi(5, 5, -1);
  b.li(2, 0);
  b.bnelTo(5, 2, 'craftRepeat');
  b.addi(3, 3, 4);
  b.jmpTo('craftLoop');
  b.mark('craftDone');

  // --- PHASE C: 子への転送（エネルギー＋持参金） ---
  ensureEnergy();
  setTargetFromGlobal(G_MY_STOR);
  b.lw(4, 7, G_CHILD_S);
  extWriteLocalId(1, 4); // 転送先=子Storage
  extWriteImm(2, 0); // substance_code=0（エネルギー）
  extWriteImm(3, CHILD_ENERGY_DOWRY);
  extWriteImm(4, 0); // result=0
  extWriteImm(0, 1); // trigger
  b.halt();
  // 持参金（表駆動）
  b.li(3, DOWRY_BASE);
  b.mark('dowryLoop');
  b.lw(4, 3, 0);
  b.beqlTo(4, 0, 'dowryDone');
  extWriteReg(2, 4); // substance_code
  extWriteImm(3, 99); // amount（在庫分だけ転送される）
  extWriteImm(4, 0);
  extWriteImm(0, 1);
  b.halt();
  b.addi(3, 3, 1);
  b.jmpTo('dowryLoop');
  b.mark('dowryDone');

  // --- PHASE D: プログラム複写（自pmem全域 → 子Processor） ---
  b.lw(2, 7, G_CHILD_P);
  b.li(1, 0x2000).out(1, 2); // pmem対象=子Processor（lid）
  b.li(1, 0x2001).li(2, 0).out(1, 2); // addr=0
  b.li(3, 0).li(5, 1024);
  b.li(1, 0x2003);
  b.mark('copyLoop');
  b.lw(2, 3, 0); // 自分のmem[r3]
  b.out(1, 2); // 子へ書込（addr自動進行）
  b.addi(3, 3, 1);
  b.bltlTo(3, 5, 'copyLoop');

  // --- 変異（オプション）: LCGで選んだアドレスの1ビットを子のコピーでのみ反転 ---
  if (options.mutation === true) {
    const gateMask = options.mutationGateMask ?? 7;
    const skip = tag('mutSkip');
    // seed = seed * 31421 + 6927
    b.lw(3, 7, G_SEED);
    b.li(2, 31421).mul(3, 3, 2);
    b.li(2, 6927).add(3, 3, 2);
    b.sw(3, 7, G_SEED);
    if (gateMask > 0) {
      // 判定はseedの上位側ビットで行う（LCGの下位ビットは周期が短く規則的なため）
      b.li(2, 8).shr(4, 3, 2);
      b.li(2, gateMask).and(4, 4, 2);
      b.li(2, 0);
      b.bnelTo(4, 2, skip);
    }
    // addr = (seed >> 3) & 1023, bit = (seed >> 13) & 15
    b.li(2, 3).shr(4, 3, 2);
    b.li(2, 1023).and(4, 4, 2);
    b.li(2, 13).shr(5, 3, 2);
    b.li(2, 15).and(5, 5, 2);
    b.li(6, 1).shl(5, 6, 5); // mask = 1 << bit
    b.lw(6, 4, 0).xor(6, 6, 5); // 自分の該当語を反転した値
    b.li(1, 0x2001).out(1, 4); // 子のaddr
    b.li(1, 0x2002).out(1, 6); // 反転語を上書き
    b.mark(skip);
  }

  // --- PHASE E: 子の起動 ---
  b.lw(2, 7, G_CHILD_P);
  b.li(1, 0x1000).out(1, 2);
  extWriteImm(0, 1); // run_flag=1

  b.jmpTo('cycle');

  // ============================================================
  // データ表の配置
  // ============================================================
  const code = b.build();
  if (code.length > CODE_LIMIT) {
    throw new Error(`祖先種プログラムのコードが大きすぎる: ${code.length} > ${CODE_LIMIT}`);
  }

  const memory = new Array<number>(1024).fill(0);
  for (let i = 0; i < code.length; i++) memory[i] = code[i];

  let addr = MATERIALS_BASE;
  for (const [substanceId, count] of MATERIALS) {
    memory[addr++] = TYPE_CODE_SUBSTANCE_BASE + substanceCodeOf(substanceId);
    memory[addr++] = count;
  }
  memory[addr] = 0;

  addr = CRAFT_BASE;
  for (const step of CRAFT_STEPS) {
    if (step.saveTo !== undefined && step.count !== 1) {
      throw new Error(`saveTo付き工程のcountは1であること: ${step.recipeId}`);
    }
    memory[addr++] = recipeCodeOf(step.recipeId);
    memory[addr++] = step.count;
    memory[addr++] = step.assemble ? 3 : 2;
    memory[addr++] =
      (step.connectFrom !== undefined ? step.connectFrom + 1 : 0) |
      ((step.saveTo !== undefined ? step.saveTo + 1 : 0) << 8);
  }
  memory[addr] = 0;
  if (addr >= DOWRY_BASE) {
    throw new Error(`工程表が持参金表の領域と重なる: ${addr}`);
  }

  addr = DOWRY_BASE;
  for (const substanceId of DOWRY) {
    memory[addr++] = substanceCodeOf(substanceId);
  }
  memory[addr] = 0;

  memory[GLOBALS_BASE + G_SEED] = (options.seedSalt ?? 0) & 0xffff;

  // 末尾の連続0は複写に含まれるので切り詰めない（pmem全域が「プログラム」）
  return memory;
};

export const ANCESTOR_LAYOUT = {
  CODE_LIMIT,
  MATERIALS_BASE,
  CRAFT_BASE,
  DOWRY_BASE,
  GLOBALS_BASE,
  G_SEED,
} as const;
