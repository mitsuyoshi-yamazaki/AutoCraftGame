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
  HARV_OFF_FILTER,
  HARV_OFF_RESULT,
  HARV_OFF_TRIGGER,
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
  }) => void;
  /** エネルギーを探索採取: グループエネルギーが target 以上になるまで、EnergyNodeを探して移動・回収する */
  forageEnergy: (opts: {
    sensorSlot: number;
    actuatorSlot: number;
    harvesterSlot: number;
    seedSlot: number;
    tmpDirSlot: number;
    target: number;
    thrust: number;
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
  }): void => {
    const { sensorSlot, actuatorSlot, harvesterSlot, seedSlot, tmpDirSlot, tmpDistSlot, wantSlot, thrust, energyLow, energyHigh } = opts;
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

    // === 各周回の先頭: エネルギー確認（枯渇による餓死凍結を防ぐ） ===
    b.mark(top);
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
    b.halt();
    b.halt();
    b.jmpTo(refuel);
    b.mark(eWander);
    wander();
    b.halt();
    b.halt();
    b.halt();
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
    b.halt();
    b.halt();
    b.halt();
    b.halt();
    b.jmpTo(top);

    b.mark(haveTarget);
    b.lw(5, 7, tmpDistSlot);
    b.li(4, FORAGE_CLOSE_DIST);
    b.bltlTo(5, 4, harvest);
    b.lw(4, 7, tmpDirSlot);
    setTargetFromGlobal(actuatorSlot);
    extWriteReg(ACT_OFF_DIRECTION, 4);
    extWriteImm(ACT_OFF_MAGNITUDE, thrust);
    b.halt();
    b.halt();
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

  const forageEnergy = (opts: {
    sensorSlot: number;
    actuatorSlot: number;
    harvesterSlot: number;
    seedSlot: number;
    tmpDirSlot: number;
    target: number;
    thrust: number;
  }): void => {
    const { sensorSlot, actuatorSlot, harvesterSlot, seedSlot, tmpDirSlot, target, thrust } = opts;
    const check = tag('feChk');
    const scan = tag('feScan');
    const notFound = tag('feNF');
    const approach = tag('feApp');
    const grab = tag('feGrab');
    const done = tag('feDone');

    b.mark(check);
    b.li(1, 0x0004).in(6, 1); // GROUP_ENERGY
    b.li(2, target);
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
    b.halt();
    b.halt();
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
    b.halt();
    b.halt();
    b.halt();
    b.halt();
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
    forageEnergy,
  };
};
