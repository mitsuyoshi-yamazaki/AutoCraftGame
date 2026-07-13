/**
 * 捕食者プログラム — Processor + Storage + Disassembler + Sensor + Actuator の5コンポーネント種。
 *
 * 動作: 起動後、指定tickまで休眠（獲物のコロニーが育つのを待つ）→
 * SCAN(filter=Processor)で最寄りの獲物Processorを探す → 方向へ推進 →
 * 射程内(距離≤2)で停止しDISASSEMBLE → 分解産物（情報系素材）を自Storageへ回収 → 次の獲物へ。
 *
 * 複製は行わない（捕食という行為の成立と、その利得＝希少I原子素材の獲得を実証する）。
 * 「何を攻撃するか」はこのプログラムの判断であり、システムは分解可能という物理法則のみ提供する。
 */

import { ProgramBuilder } from '../vm/program-builder';

const GLOBALS_BASE = 960;
const G_ACT = 0;
const G_DIS = 1;
const G_SENS = 2;

const THRUST_MAGNITUDE = 60;
const ATTACK_RANGE = 2;

export const buildPredatorProgram = (wakeTick: number): number[] => {
  const b = new ProgramBuilder();
  let tagCounter = 0;
  const tag = (name: string): string => `${name}_${tagCounter++}`;

  const extWriteImm = (offset: number, value: number): void => {
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1002).li(2, value).out(1, 2);
  };
  const extWriteReg = (offset: number, reg: number): void => {
    if (reg === 1 || reg === 2) throw new Error('r1/r2はスクラッチ');
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1002).out(1, reg);
  };
  const extRead = (offset: number, rd: number): void => {
    b.li(1, 0x1001).li(2, offset).out(1, 2);
    b.li(1, 0x1002).in(rd, 1);
  };
  const setTargetFromGlobal = (slot: number): void => {
    b.lw(2, 7, slot);
    b.li(1, 0x1000).out(1, 2);
  };

  // --- boot: 自グループ構成の把握 ---
  b.li(7, GLOBALS_BASE);
  const cscanFind = (filterCode: number, slot: number): void => {
    b.li(1, 0x0102).li(2, filterCode).out(1, 2);
    b.li(1, 0x0101).li(2, 1).out(1, 2);
    b.halt();
    b.li(1, 0x0104).in(3, 1);
    b.sw(3, 7, slot);
  };
  cscanFind(4, G_ACT); // Actuator
  cscanFind(7, G_DIS); // Disassembler
  cscanFind(5, G_SENS); // Sensor

  // --- 休眠: コロニーが育つまで待つ ---
  b.mark('sleep');
  b.li(1, 0x0002).in(3, 1); // SELF_TICK
  b.li(2, wakeTick);
  b.bgelTo(3, 2, 'hunt');
  b.halt();
  b.jmpTo('sleep');

  // --- 狩りループ ---
  b.mark('hunt');
  // SCAN: filter=2（Processor）
  setTargetFromGlobal(G_SENS);
  extWriteImm(1, 2); // filter
  extWriteImm(0, 1); // trigger
  b.halt();
  extRead(2, 3); // count
  const found = tag('found');
  b.li(2, 0);
  b.bnelTo(3, 2, found);
  // 獲物なし: 推進を止め、しばらく待ってから再スキャン（スキャン連打での消耗を防ぐ）
  setTargetFromGlobal(G_ACT);
  extWriteImm(1, 0); // magnitude=0
  for (let i = 0; i < 8; i++) b.halt();
  b.jmpTo('hunt');

  b.mark(found);
  // entry0: [3]=id, [5]=距離, [6]=方向
  extRead(3, 4); // r4 = 獲物の生ID
  extRead(5, 5); // r5 = 距離
  extRead(6, 6); // r6 = 方向
  b.li(2, ATTACK_RANGE + 1);
  b.bltlTo(5, 2, 'attack'); // 距離 ≤ ATTACK_RANGE

  // 接近: Actuatorへ方向・推力を設定して数tick進む
  setTargetFromGlobal(G_ACT);
  extWriteReg(0, 6); // direction
  extWriteImm(1, THRUST_MAGNITUDE);
  b.halt();
  b.halt();
  b.halt();
  b.jmpTo('hunt'); // 再スキャン（方向を更新しながら追う）

  // 攻撃: 停止してDISASSEMBLE
  b.mark('attack');
  setTargetFromGlobal(G_ACT);
  extWriteImm(1, 0); // 停止
  setTargetFromGlobal(G_DIS);
  extWriteReg(1, 4); // target = 獲物の生ID（SCAN結果は生IDなのでそのまま書ける）
  extWriteImm(4, 0); // result=0
  extWriteImm(0, 1); // trigger
  const waitKill = tag('waitKill');
  b.mark(waitKill);
  b.halt();
  extRead(4, 3); // result
  b.li(2, 0);
  b.beqlTo(3, 2, waitKill);
  b.jmpTo('hunt');

  const code = b.build();
  if (code.length > GLOBALS_BASE) {
    throw new Error(`捕食者プログラムが大きすぎる: ${code.length}`);
  }
  const memory = new Array<number>(1024).fill(0);
  for (let i = 0; i < code.length; i++) memory[i] = code[i];
  return memory;
};
