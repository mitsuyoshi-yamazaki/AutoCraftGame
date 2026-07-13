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
import type { ProgramBuilder } from '../vm/program-builder';

export const GLOBALS_BASE = 960;

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
  };
};
