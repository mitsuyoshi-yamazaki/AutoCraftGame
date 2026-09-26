/**
 * 祖先種プログラムの共通ビルドヘルパ。
 * 外部opmem I/O、CSCANによる構成把握、エネルギー確保、単一レシピのクラフトなど、
 * 複数の「種」が共有するVMコードパターンを提供する。
 *
 * 規約: r1/r2 はヘルパのスクラッチ。呼び出し側が値を渡すレジスタは r3〜r6 を使う。
 * r7 はグローバル領域（GLOBALS_BASE）のベースアドレスに固定する。
 */

import { craftTicksFor } from '../sim/actions-assembler';
import { DEFAULT_GAME_PARAMS } from '../params';
import { recipeByCode } from '../sim/codes';
import {
  ACT_OFF_DIRECTION,
  ACT_OFF_MAGNITUDE,
  ASM_OFF_ACTION_TRIGGER,
  ASM_OFF_REPAIR_TARGET,
  ASM_OFF_RESULT,
  ASM_TRIGGER_REPAIR,
  HARV_OFF_FILTER,
  HARV_OFF_RESULT,
  HARV_OFF_TRIGGER,
  PROC_OFF_CSCAN_RESULTS,
  SCAN_ENTRY_WORDS,
  SENS_ENTRY_WORDS,
  SENS_OFF_COUNT,
  SENS_OFF_FILTER,
  SENS_OFF_RESULTS,
  SENS_OFF_TRIGGER,
} from '../sim/opmem';
import type { ProgramBuilder } from '../vm/program-builder';

export const GLOBALS_BASE = 960;

/** SCANフィルタ: 物質（MatterNode/地面）を対象にする */
const SCAN_FILTER_MATTER = 9;
/** SCANフィルタ: エネルギー（EnergyNode）を対象にする */
const SCAN_FILTER_ENERGY = 10;
/** 採取に十分近いと見なす距離 */
const FORAGE_CLOSE_DIST = 3;
/** 自opmemのI/Oアドレス基点（0x0100 + オフセット） */
const SELF_OPMEM_IO_BASE = 0x0100;
/** 自身の耐久度 / 自身のオブジェクトIDを読むI/Oポート */
const IO_SELF_DURABILITY = 0x0005;
const IO_SELF_OBJECT_ID = 0x0006;
/** CSCAN結果1件の耐久度(aux)欄のオフセット */
const CSCAN_AUX = 3;
/** Processorのコンポーネント種別コード（自己修理の材料を表から引くのに使う） */
const TYPE_CODE_PROCESSOR = 2;

/** SCAN結果1件あたりのフィールドオフセット */
const R_ID = 0, R_TYPE = 1, R_DIST = 2, R_DIR = 3;

export interface Helpers {
  extWriteImm: (offset: number, value: number) => void;
  extWriteReg: (offset: number, reg: number) => void;
  extWriteLocalId: (offset: number, reg: number) => void;
  extRead: (offset: number, rd: number) => void;
  setTargetFromGlobal: (slot: number) => void;
  setTargetReg: (reg: number) => void;
  cscanFind: (filterCode: number, slot: number) => void;
  ensureEnergy: (harvesterSlot: number, energyLow: number) => void;
  /** グローバルslotのAssemblerで recipeCode を1回クラフト/組立する。
   *  assemble=trueはASSEMBLE（connectSlot>=0なら接続先のlidをそのグローバルから取る）。
   *  完了を待ち、生成物のlidを saveSlot(>=0)へ保存する。 */
  craftOne: (
    asmSlot: number,
    recipeCode: number,
    assemble: boolean,
    connectSlot: number,
    saveSlot: number,
  ) => void;
  /** 材料表（[filterCode, count]* , 0）を回収する。tableAddrは即値 */
  gatherFromTable: (harvesterSlot: number, tableAddr: number, energyLow: number) => void;
  /** レシピコード表（recipeCode*, 0）を順に非組立クラフトする。各クラフト前にエネルギーを確保する。
   *  同一物質を1個ずつ作るクラフト系列を1つのループにまとめてコードを節約するためのもの。 */
  craftListLoop: (
    asmSlot: number,
    harvesterSlot: number,
    tableAddr: number,
    energyLow: number,
  ) => void;
  /**
   * 探索採取: matTypeCode(=100+物質コード)の物質を1個回収する。移動種の中核。
   * SCANで対象を探し、方向へActuatorで推進して接近、射程内でHarvesterが採取する。
   * 見つからなければ自前LCG（seedSlot）で方向を選び彷徨してから再SCANする。
   * グローバル tmpDirSlot/tmpDistSlot を作業領域として使う。
   */
  forageOne: (opts: {
    sensorSlot: number;
    actuatorSlot: number;
    harvesterSlot: number;
    seedSlot: number;
    tmpDirSlot: number;
    tmpDistSlot: number;
    /** 回収したい物質の種別コード(100+物質コード)を保持するグローバルslot（ループ可能にするため） */
    wantSlot: number;
    thrust: number;
    energyLow: number;
    energyHigh: number;
    /**
     * 探索の1周ごとに差し込むコード（維持・修理など）。希少物質の探索は数千tickに及ぶことがあり、
     * その間に器官が摩耗し切ると探索そのものが破綻するため、周回の先頭で点検できるようにする。
     * 省略時は何も出力しない（既存の種のプログラムは変わらない）。
     */
    perRound?: () => void;
    /** 対象へ接近する1周あたりのtick数（既定2） */
    approachTicks?: number;
    /** 彷徨の1周あたりのtick数（既定4） */
    wanderTicks?: number;
    /**
     * 拾い上げ表のアドレス（種別コードの並び + 終端0）。指定すると、探索中のSCANに写った
     * **射程内の**これらの物質を、目的の物質でなくてもその場で回収する。
     * SCANは目的の物質を探すためにどのみち撃っているので、追加のSCANは要らない。
     * 死んだ個体の分解物のように、自然ノードからは採れない物質を経済へ戻す手段である。
     */
    pickupTable?: number;
  }) => void;
  /**
   * 群れの維持（自己修復）: 耐久度が threshold を下回った器官をAssemblerのREPAIRで修理する。
   * 自分（Processor）はSELF_DURABILITYで、他のメンバーはCSCAN結果の耐久度(aux)で判定する。
   * 修理が拒否されても（材料・エネルギー不足）結果コードが返るため停止しない。
   * r3〜r6 と iSlot/countSlot を破壊する。
   */
  maintainGroup: (opts: {
    asmSlot: number;
    /** ループ添字の退避先グローバルslot */
    iSlot: number;
    /** CSCAN件数の退避先グローバルslot */
    countSlot: number;
    threshold: number;
    /**
     * 閾値をゲノムから読むときの語アドレス。指定すると即値ではなく mem[addr] を使う。
     * 省略時の出力は1語も変わらない（既存種のプログラムを変えないため）。
     */
    thresholdAddr?: number;
    /**
     * 修理で排出された摩耗材を拾い直すHarvesterのグローバルslot。
     * REPAIRは新しい材料と引き換えに等量の摩耗材を足元へ排出する（原子保存）。
     * 拾わなければ修理のたびに材料1個を捨て続けることになるので、拾って再利用する。
     * repairMaterialTable と両方指定したときだけ回収コードを出す。
     */
    harvesterSlot?: number;
    /** コンポーネント種別コード(1-8)を添字に、その修理材料の種別コード(100+物質)を並べた表のアドレス */
    repairMaterialTable?: number;
  }) => void;
  /** エネルギーを探索採取: グループエネルギーが target 以上になるまで、EnergyNodeを探して移動・回収する */
  forageEnergy: (opts: {
    sensorSlot: number;
    actuatorSlot: number;
    harvesterSlot: number;
    seedSlot: number;
    tmpDirSlot: number;
    target: number;
    /** 目標値をゲノムから読むときの語アドレス（省略時は即値。thresholdAddr と同じ性格）*/
    targetAddr?: number;
    thrust: number;
    approachTicks?: number;
    wanderTicks?: number;
  }) => void;
}

/** レシピの所要tick（待機ループの回数に使う。呼び出し側で定数として展開される） */
export const recipeTicks = (recipeCode: number): number => {
  const recipe = recipeByCode(recipeCode);
  if (recipe === undefined) throw new Error(`未定義レシピ: ${recipeCode}`);
  return craftTicksFor(recipe, DEFAULT_GAME_PARAMS);
};

export const makeHelpers = (
  b: ProgramBuilder,
  tag: (name: string) => string,
): Helpers => {
  const extWriteImm = (offset: number, value: number): void => {
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1002).li(2, value).out(1, 2);
  };
  const guard = (reg: number): void => {
    if (reg === 1 || reg === 2) throw new Error(`r${reg}はスクラッチ（値はr3〜r6で渡すこと）`);
  };
  const extWriteReg = (offset: number, reg: number): void => {
    guard(reg);
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1002).out(1, reg);
  };
  const extWriteLocalId = (offset: number, reg: number): void => {
    guard(reg);
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1005).out(1, reg);
  };
  const extRead = (offset: number, rd: number): void => {
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1002).in(rd, 1);
  };
  const setTargetFromGlobal = (slot: number): void => {
    b.lw(2, 7, slot);
    b.li(1, 0x1000).out(1, 2);
  };
  const setTargetReg = (reg: number): void => {
    guard(reg);
    b.li(1, 0x1000).out(1, reg);
  };
  const cscanFind = (filterCode: number, slot: number): void => {
    b.li(1, 0x0102).li(2, filterCode).out(1, 2);
    b.li(1, 0x0101).li(2, 1).out(1, 2);
    b.halt();
    b.li(1, 0x0104).in(3, 1);
    b.sw(3, 7, slot);
  };
  const ensureEnergy = (harvesterSlot: number, energyLow: number): void => {
    const check = tag('eeCheck');
    const done = tag('eeDone');
    b.mark(check);
    b.li(1, 0x0004).in(6, 1);
    b.li(2, energyLow);
    b.bgelTo(6, 2, done);
    setTargetFromGlobal(harvesterSlot);
    extWriteImm(2, 0);
    extWriteImm(1, 20);
    extWriteImm(0, 1);
    b.halt();
    b.jmpTo(check);
    b.mark(done);
  };
  const gatherFromTable = (harvesterSlot: number, tableAddr: number, energyLow: number): void => {
    const loop = tag('gLoop');
    const done = tag('gDone');
    const one = tag('gOne');
    b.li(3, tableAddr);
    b.mark(loop);
    b.lw(4, 3, 0);
    b.beqlTo(4, 0, done);
    b.lw(5, 3, 1);
    b.mark(one);
    ensureEnergy(harvesterSlot, energyLow);
    setTargetFromGlobal(harvesterSlot);
    extWriteImm(2, 0);
    extWriteReg(1, 4);
    extWriteImm(0, 1);
    b.halt();
    extRead(2, 6);
    b.li(2, 1);
    b.bnelTo(6, 2, one);
    b.addi(5, 5, -1);
    b.li(2, 0);
    b.bnelTo(5, 2, one);
    b.addi(3, 3, 2);
    b.jmpTo(loop);
    b.mark(done);
  };
  const craftOne = (
    asmSlot: number,
    recipeCode: number,
    assemble: boolean,
    connectSlot: number,
    saveSlot: number,
  ): void => {
    const retry = tag('cRetry');
    const cfgOk = tag('cCfgOk');
    const waitCfg = tag('cWaitCfg');
    const waitRes = tag('cWaitRes');
    b.mark(retry);
    setTargetFromGlobal(asmSlot);
    extRead(8, 6); // configured_recipe
    b.li(2, recipeCode);
    b.beqlTo(6, 2, cfgOk);
    extWriteImm(1, recipeCode);
    extWriteImm(0, 1); // SET_RECIPE
    b.mark(waitCfg);
    b.halt();
    extRead(8, 6);
    b.li(2, recipeCode);
    b.bnelTo(6, 2, waitCfg);
    b.mark(cfgOk);
    if (assemble && connectSlot >= 0) {
      b.lw(4, 7, connectSlot);
      extWriteLocalId(2, 4); // connection_target
    } else {
      extWriteImm(2, 0);
    }
    extWriteImm(3, 0xff); // 辺AUTO
    extWriteImm(0, assemble ? 3 : 2);
    b.mark(waitRes);
    b.halt();
    extRead(7, 6);
    b.beqlTo(6, 0, waitRes);
    b.li(2, 1);
    b.bnelTo(6, 2, retry); // 失敗 → やり直し
    if (saveSlot >= 0) {
      b.li(1, 0x1001).li(2, 9).out(1, 2); // last_product
      b.li(1, 0x1005).in(4, 1);
      b.sw(4, 7, saveSlot);
    }
  };
  const craftListLoop = (
    asmSlot: number,
    harvesterSlot: number,
    tableAddr: number,
    energyLow: number,
  ): void => {
    const loop = tag('clLoop');
    const done = tag('clDone');
    const retry = tag('clRetry');
    const cfgOk = tag('clCfgOk');
    const waitCfg = tag('clWaitCfg');
    const waitRes = tag('clWaitRes');
    b.li(3, tableAddr);
    b.mark(loop);
    b.lw(5, 3, 0); // r5 = recipeCode
    b.beqlTo(5, 0, done);
    b.mark(retry);
    ensureEnergy(harvesterSlot, energyLow);
    setTargetFromGlobal(asmSlot);
    extRead(8, 6); // configured_recipe
    b.beqlTo(6, 5, cfgOk);
    extWriteReg(1, 5);
    extWriteImm(0, 1); // SET_RECIPE
    b.mark(waitCfg);
    b.halt();
    extRead(8, 6);
    b.bnelTo(6, 5, waitCfg);
    b.mark(cfgOk);
    extWriteImm(2, 0); // 自由設置（未使用）
    extWriteImm(0, 2); // CRAFT
    b.mark(waitRes);
    b.halt();
    extRead(7, 6);
    b.beqlTo(6, 0, waitRes);
    b.li(2, 1);
    b.bnelTo(6, 2, retry); // 失敗 → やり直し
    b.addi(3, 3, 1);
    b.jmpTo(loop);
    b.mark(done);
  };
  /** 現在の外部opmem対象の、レジスタで与えたオフセットを読む（動的オフセット読み取り） */
  const extReadDyn = (offsetReg: number, destReg: number): void => {
    guard(offsetReg);
    b.li(1, 0x1001).out(1, offsetReg);
    b.li(1, 0x1002).in(destReg, 1);
  };

  const forageOne = (opts: {
    sensorSlot: number;
    actuatorSlot: number;
    harvesterSlot: number;
    seedSlot: number;
    tmpDirSlot: number;
    tmpDistSlot: number;
    wantSlot: number;
    thrust: number;
    /** エネルギーがこれを下回ったら材料探索を中断してエネルギー補給する */
    energyLow: number;
    /** 補給時にこの水準までエネルギーを貯める（ヒステリシス） */
    energyHigh: number;
    perRound?: () => void;
    /**
     * 接近・彷徨の1周あたりtick数。大きいほど**SCANの回数が減る**——SCANは1回5エネルギーを消費し、
     * Sensorを1摩耗させるので、同じ距離をより少ないSCANで進むほど安く、器官も保つ。
     * 推進は継続するので、長くとるほど等速に近づき、直進距離も伸びる（既定値は従来の挙動）。
     */
    approachTicks?: number;
    wanderTicks?: number;
    pickupTable?: number;
  }): void => {
    const { sensorSlot, actuatorSlot, harvesterSlot, seedSlot, tmpDirSlot, tmpDistSlot, wantSlot, thrust, energyLow, energyHigh, perRound, pickupTable } = opts;
    const approachTicks = opts.approachTicks ?? 2;
    const wanderTicks = opts.wanderTicks ?? 4;
    const halts = (n: number): void => {
      for (let i = 0; i < n; i++) b.halt();
    };
    const top = tag('foTop');
    const mat = tag('foMat');
    const refuel = tag('foRef');
    const eWander = tag('foEW');
    const eGrab = tag('foEG');
    const scanLoop = tag('foScan');
    const notFound = tag('foNF');
    const haveTarget = tag('foHave');
    const harvest = tag('foHarv');
    const matched = tag('foMatch');

    /**
     * いまSCAN結果を見ているエントリ（r3=添字, r4=種別, r5=type欄アドレス）が拾い上げ表にあり、
     * かつ採取射程内なら、その場で1個回収する。r3（添字）とr6（件数）は壊さずに戻る。
     */
    const pickupIfListed = (): void => {
      const tableLoop = tag('puLoop');
      const hit = tag('puHit');
      const done = tag('puDone');
      b.li(5, pickupTable ?? 0);
      b.mark(tableLoop);
      b.lw(2, 5, 0);
      b.beqlTo(2, 0, done);
      b.beqlTo(2, 4, hit);
      b.addi(5, 5, 1);
      b.jmpTo(tableLoop);
      b.mark(hit);
      // 距離欄（エントリ先頭+2）を読む。射程外なら拾わない（寄り道はしない）
      b.li(5, SENS_ENTRY_WORDS).mul(5, 3, 5);
      b.addi(5, 5, SENS_OFF_RESULTS + 2);
      extReadDyn(5, 5);
      b.li(2, FORAGE_CLOSE_DIST);
      b.bgelTo(5, 2, done);
      setTargetFromGlobal(harvesterSlot);
      extWriteImm(HARV_OFF_RESULT, 0);
      extWriteReg(HARV_OFF_FILTER, 4);
      extWriteImm(HARV_OFF_TRIGGER, 1);
      b.halt();
      // 外部opmem対象をSensorへ戻し、件数を読み直す（r6は呼び出し側のループ条件）
      setTargetFromGlobal(sensorSlot);
      extRead(SENS_OFF_COUNT, 6);
      b.mark(done);
    };

    const wander = (): void => {
      b.lw(3, 7, seedSlot);
      b.li(5, 31421).mul(3, 3, 5);
      b.li(5, 6927).add(3, 3, 5);
      b.sw(3, 7, seedSlot);
      b.li(5, 8).shr(4, 3, 5);
      b.li(5, 255).and(4, 4, 5);
      setTargetFromGlobal(actuatorSlot);
      extWriteReg(ACT_OFF_DIRECTION, 4);
      extWriteImm(ACT_OFF_MAGNITUDE, thrust);
    };

    // === 各周回の先頭: 任意の維持処理 → エネルギー確認（枯渇による餓死凍結を防ぐ） ===
    b.mark(top);
    if (perRound !== undefined) perRound();
    b.li(1, 0x0004).in(6, 1); // GROUP_ENERGY
    b.li(2, energyLow);
    b.bgelTo(6, 2, mat); // 十分 → 材料探索
    // --- 補給ループ（energyHighまで貯める） ---
    b.mark(refuel);
    b.li(1, 0x0004).in(6, 1);
    b.li(2, energyHigh);
    b.bgelTo(6, 2, mat);
    setTargetFromGlobal(sensorSlot);
    extWriteImm(SENS_OFF_FILTER, SCAN_FILTER_ENERGY);
    extWriteImm(SENS_OFF_TRIGGER, 1);
    b.halt();
    setTargetFromGlobal(sensorSlot);
    extRead(SENS_OFF_COUNT, 6);
    b.li(2, 0);
    b.beqlTo(6, 2, eWander);
    extRead(SENS_OFF_RESULTS + R_DIST, 5);
    extRead(SENS_OFF_RESULTS + R_DIR, 4);
    b.li(2, FORAGE_CLOSE_DIST);
    b.bltlTo(5, 2, eGrab);
    setTargetFromGlobal(actuatorSlot);
    extWriteReg(ACT_OFF_DIRECTION, 4);
    extWriteImm(ACT_OFF_MAGNITUDE, thrust);
    halts(approachTicks);
    b.jmpTo(refuel);
    b.mark(eWander);
    wander();
    halts(Math.max(1, wanderTicks - 1));
    b.jmpTo(refuel);
    b.mark(eGrab);
    setTargetFromGlobal(actuatorSlot);
    extWriteImm(ACT_OFF_MAGNITUDE, 0);
    setTargetFromGlobal(harvesterSlot);
    extWriteImm(HARV_OFF_RESULT, 0);
    extWriteImm(HARV_OFF_FILTER, 20); // エネルギー種別コード
    extWriteImm(HARV_OFF_TRIGGER, 1);
    b.halt();
    b.jmpTo(refuel);

    // === 材料探索 ===
    b.mark(mat);
    setTargetFromGlobal(sensorSlot);
    extWriteImm(SENS_OFF_FILTER, SCAN_FILTER_MATTER);
    extWriteImm(SENS_OFF_TRIGGER, 1);
    b.halt();
    setTargetFromGlobal(sensorSlot);
    extRead(SENS_OFF_COUNT, 6);
    b.li(3, 0); // i
    b.mark(scanLoop);
    b.bgelTo(3, 6, notFound);
    b.li(4, SENS_ENTRY_WORDS).mul(5, 3, 4).addi(5, 5, SENS_OFF_RESULTS + 1); // type欄
    extReadDyn(5, 4);
    b.lw(2, 7, wantSlot);
    b.beqlTo(4, 2, matched);
    if (pickupTable !== undefined) pickupIfListed();
    b.addi(3, 3, 1);
    b.jmpTo(scanLoop);
    b.mark(matched);
    b.addi(5, 5, 2); // dir欄
    extReadDyn(5, 4);
    b.sw(4, 7, tmpDirSlot);
    b.addi(5, 5, -1); // dist欄
    extReadDyn(5, 4);
    b.sw(4, 7, tmpDistSlot);
    b.jmpTo(haveTarget);

    b.mark(notFound);
    wander();
    halts(wanderTicks);
    b.jmpTo(top);

    b.mark(haveTarget);
    b.lw(5, 7, tmpDistSlot);
    b.li(4, FORAGE_CLOSE_DIST);
    b.bltlTo(5, 4, harvest);
    b.lw(4, 7, tmpDirSlot);
    setTargetFromGlobal(actuatorSlot);
    extWriteReg(ACT_OFF_DIRECTION, 4);
    extWriteImm(ACT_OFF_MAGNITUDE, thrust);
    halts(approachTicks);
    b.jmpTo(top);

    b.mark(harvest);
    setTargetFromGlobal(actuatorSlot);
    extWriteImm(ACT_OFF_MAGNITUDE, 0);
    setTargetFromGlobal(harvesterSlot);
    extWriteImm(HARV_OFF_RESULT, 0);
    b.lw(4, 7, wantSlot);
    extWriteReg(HARV_OFF_FILTER, 4);
    extWriteImm(HARV_OFF_TRIGGER, 1);
    b.halt();
    extRead(HARV_OFF_RESULT, 6);
    b.li(2, 1);
    b.bnelTo(6, 2, top); // 失敗 → 再探索（エネルギー確認から）
  };

  const maintainGroup = (opts: {
    asmSlot: number;
    iSlot: number;
    countSlot: number;
    threshold: number;
    /**
     * 閾値をゲノムから読むときの語アドレス。指定すると即値ではなく mem[addr] を使う。
     * 省略時の出力は1語も変わらない（既存種のプログラムを変えないため）。
     */
    thresholdAddr?: number;
    harvesterSlot?: number;
    repairMaterialTable?: number;
  }): void => {
    const { asmSlot, iSlot, countSlot, threshold, thresholdAddr, harvesterSlot, repairMaterialTable } = opts;
    /** 閾値をレジスタへ置く。thresholdAddr 指定時はゲノムの語を読む（進化する閾値）*/
    const loadThreshold = (reg: number): void => {
      if (thresholdAddr === undefined) b.li(reg, threshold);
      else b.li(reg, thresholdAddr).lw(reg, reg, 0);
    };
    const skipSelf = tag('mgSkipSelf');
    const waitSelf = tag('mgWaitSelf');
    const loop = tag('mgLoop');
    const next = tag('mgNext');
    const done = tag('mgDone');
    const waitRepair = tag('mgWaitRepair');

    /**
     * 現在の外部opmem対象（Assembler）へ、r4のIDを対象にしたREPAIRを出して結果を待つ。
     * 成功したら足元へ排出された摩耗材（r5に種別コードを入れておく）を拾い直す。
     */
    const triggerRepair = (viaLocalId: boolean, waitTag: string): void => {
      if (viaLocalId) extWriteLocalId(ASM_OFF_REPAIR_TARGET, 4);
      else extWriteReg(ASM_OFF_REPAIR_TARGET, 4);
      extWriteImm(ASM_OFF_RESULT, 0);
      extWriteImm(ASM_OFF_ACTION_TRIGGER, ASM_TRIGGER_REPAIR);
      b.mark(waitTag);
      b.halt();
      extRead(ASM_OFF_RESULT, 6);
      b.beqlTo(6, 0, waitTag); // 拒否でも非0が返るので停止しない
      if (harvesterSlot === undefined || repairMaterialTable === undefined) return;
      const skipPick = tag('mgSkipPick');
      b.li(2, 1);
      b.bnelTo(6, 2, skipPick); // 成功時のみ排出物がある
      setTargetFromGlobal(harvesterSlot);
      extWriteImm(HARV_OFF_RESULT, 0);
      extWriteReg(HARV_OFF_FILTER, 5); // r5 = 摩耗材の種別コード
      extWriteImm(HARV_OFF_TRIGGER, 1);
      b.halt();
      b.mark(skipPick);
    };

    // === 自分（Processor）: CSCANの対象外なので専用ポートで判定する ===
    b.li(1, IO_SELF_DURABILITY).in(6, 1);
    loadThreshold(2);
    b.bgelTo(6, 2, skipSelf);
    if (repairMaterialTable !== undefined) {
      b.li(5, repairMaterialTable + TYPE_CODE_PROCESSOR);
      b.lw(5, 5, 0); // 自分（Processor）の修理材料
    }
    setTargetFromGlobal(asmSlot);
    b.li(1, IO_SELF_OBJECT_ID).in(4, 1); // Assemblerは生IDで対象を解決する
    triggerRepair(false, waitSelf);
    b.mark(skipSelf);

    // === 同グループの他メンバー: CSCAN結果の耐久度(aux)で判定する ===
    b.li(1, 0x0102).li(2, 0).out(1, 2); // CSCAN_FILTER=0（全メンバー）
    b.li(1, 0x0101).li(2, 1).out(1, 2); // CSCAN_TRIGGER
    b.halt();
    b.li(1, 0x0103).in(3, 1); // CSCAN_COUNT
    b.sw(3, 7, countSlot);
    b.li(3, 0).sw(3, 7, iSlot);
    b.mark(loop);
    b.lw(3, 7, iSlot);
    b.lw(4, 7, countSlot);
    b.bgelTo(3, 4, done);
    // r5 = i番目の結果エントリ先頭の自opmem I/Oアドレス
    b.li(2, SCAN_ENTRY_WORDS).mul(5, 3, 2);
    b.li(2, SELF_OPMEM_IO_BASE + PROC_OFF_CSCAN_RESULTS).add(5, 5, 2);
    b.addi(6, 5, CSCAN_AUX);
    b.in(6, 6); // 耐久度
    loadThreshold(2);
    b.bgelTo(6, 2, next);
    b.in(4, 5); // ローカルID（r5はまだエントリ先頭アドレス）
    if (repairMaterialTable !== undefined) {
      b.addi(6, 5, 1); // type欄のアドレス
      b.in(6, 6); // コンポーネント種別コード
      b.li(2, repairMaterialTable).add(6, 6, 2);
      b.lw(5, 6, 0); // r5 = その器官の修理材料の種別コード
    }
    setTargetFromGlobal(asmSlot);
    triggerRepair(true, waitRepair);
    b.mark(next);
    b.lw(3, 7, iSlot);
    b.addi(3, 3, 1);
    b.sw(3, 7, iSlot);
    b.jmpTo(loop);
    b.mark(done);
  };

  const forageEnergy = (opts: {
    sensorSlot: number;
    actuatorSlot: number;
    harvesterSlot: number;
    seedSlot: number;
    tmpDirSlot: number;
    target: number;
    /** 目標値をゲノムから読むときの語アドレス（省略時は即値。thresholdAddr と同じ性格）*/
    targetAddr?: number;
    thrust: number;
    approachTicks?: number;
    wanderTicks?: number;
  }): void => {
    const { sensorSlot, actuatorSlot, harvesterSlot, seedSlot, tmpDirSlot, target, targetAddr, thrust } = opts;
    const approachTicks = opts.approachTicks ?? 2;
    const wanderTicks = opts.wanderTicks ?? 4;
    const halts = (n: number): void => {
      for (let i = 0; i < n; i++) b.halt();
    };
    const check = tag('feChk');
    const scan = tag('feScan');
    const notFound = tag('feNF');
    const approach = tag('feApp');
    const grab = tag('feGrab');
    const done = tag('feDone');

    b.mark(check);
    b.li(1, 0x0004).in(6, 1); // GROUP_ENERGY
    if (targetAddr === undefined) b.li(2, target);
    else b.li(2, targetAddr).lw(2, 2, 0);
    b.bgelTo(6, 2, done); // 十分 → 終了
    b.mark(scan);
    setTargetFromGlobal(sensorSlot);
    extWriteImm(SENS_OFF_FILTER, SCAN_FILTER_ENERGY);
    extWriteImm(SENS_OFF_TRIGGER, 1);
    b.halt();
    setTargetFromGlobal(sensorSlot);
    extRead(SENS_OFF_COUNT, 6);
    b.li(2, 0);
    b.beqlTo(6, 2, notFound); // 0件 → 彷徨
    // 最寄り(entry0)の距離・方向
    extRead(SENS_OFF_RESULTS + R_DIST, 5); // r5 = dist
    extRead(SENS_OFF_RESULTS + R_DIR, 4); // r4 = dir
    b.li(2, FORAGE_CLOSE_DIST);
    b.bltlTo(5, 2, grab);
    b.mark(approach);
    setTargetFromGlobal(actuatorSlot);
    extWriteReg(ACT_OFF_DIRECTION, 4);
    extWriteImm(ACT_OFF_MAGNITUDE, thrust);
    halts(approachTicks);
    b.jmpTo(scan);
    b.mark(notFound);
    b.lw(3, 7, seedSlot);
    b.li(5, 31421).mul(3, 3, 5);
    b.li(5, 6927).add(3, 3, 5);
    b.sw(3, 7, seedSlot);
    b.li(5, 8).shr(4, 3, 5);
    b.li(5, 255).and(4, 4, 5);
    void tmpDirSlot;
    setTargetFromGlobal(actuatorSlot);
    extWriteReg(ACT_OFF_DIRECTION, 4);
    extWriteImm(ACT_OFF_MAGNITUDE, thrust);
    halts(wanderTicks);
    b.jmpTo(scan);
    b.mark(grab);
    setTargetFromGlobal(actuatorSlot);
    extWriteImm(ACT_OFF_MAGNITUDE, 0);
    setTargetFromGlobal(harvesterSlot);
    extWriteImm(HARV_OFF_RESULT, 0);
    extWriteImm(HARV_OFF_FILTER, SCAN_FILTER_ENERGY * 0 + 20); // エネルギー種別コード=20
    extWriteImm(HARV_OFF_TRIGGER, 1);
    b.halt();
    b.jmpTo(check); // まだ足りなければ繰り返す
    b.mark(done);
  };

  return {
    extWriteImm,
    extWriteReg,
    extWriteLocalId,
    extRead,
    setTargetFromGlobal,
    setTargetReg,
    cscanFind,
    ensureEnergy,
    craftOne,
    gatherFromTable,
    craftListLoop,
    forageOne,
    maintainGroup,
    forageEnergy,
  };
};
