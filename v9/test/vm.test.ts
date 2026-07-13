import { describe, expect, it } from 'vitest';
import { ProgramBuilder } from '../src/vm/program-builder';
import { createVm, executeOneTick, loadProgram } from '../src/vm/vm';

const run = (
  program: number[],
  maxInstructions = 100,
  io?: { read?: (addr: number) => number; writes?: Array<[number, number]> },
) => {
  const vm = loadProgram(createVm(1024), program);
  const writes: Array<[number, number]> = io?.writes ?? [];
  return {
    result: executeOneTick(
      vm,
      io?.read ?? (() => 0),
      (addr, value) => writes.push([addr, value]),
      maxInstructions,
    ),
    writes,
  };
};

describe('VM（v8互換）', () => {
  it('LIと算術命令', () => {
    const program = new ProgramBuilder().li(1, 100).li(2, 42).add(3, 1, 2).sub(4, 1, 2).halt().build();
    const { result } = run(program);
    expect(result.vm.registers[3]).toBe(142);
    expect(result.vm.registers[4]).toBe(58);
  });

  it('r0は常に0（書き込みは破棄）', () => {
    const program = new ProgramBuilder().li(0, 999).add(1, 0, 0).halt().build();
    const { result } = run(program);
    expect(result.vm.registers[0]).toBe(0);
    expect(result.vm.registers[1]).toBe(0);
  });

  it('LW/SWでメモリを読み書きできる（フォンノイマン: プログラム自身も読める）', () => {
    const builder = new ProgramBuilder();
    builder.li(1, 500).li(2, 1234).sw(2, 1, 0).lw(3, 1, 0).halt();
    const { result } = run(builder.build());
    expect(result.vm.memory[500]).toBe(1234);
    expect(result.vm.registers[3]).toBe(1234);
  });

  it('PC相対の長分岐（BNEL）でループできる', () => {
    // r1をデクリメントして0になるまでループ
    const builder = new ProgramBuilder();
    builder.li(1, 5).li(2, 0).mark('loop').addi(1, 1, -1).bnelTo(1, 2, 'loop').halt();
    const { result } = run(builder.build());
    expect(result.vm.registers[1]).toBe(0);
  });

  it('HALTでtickが終了し、次tickはHALTの次から再開する', () => {
    const builder = new ProgramBuilder();
    builder.li(1, 1).halt().li(1, 2).halt();
    const program = builder.build();
    const vm1 = loadProgram(createVm(1024), program);
    const tick1 = executeOneTick(vm1, () => 0, () => undefined, 100);
    expect(tick1.vm.registers[1]).toBe(1);
    const tick2 = executeOneTick(tick1.vm, () => 0, () => undefined, 100);
    expect(tick2.vm.registers[1]).toBe(2);
  });

  it('IN/OUTがI/Oコールバックへ届く', () => {
    const builder = new ProgramBuilder();
    builder.li(1, 0x1000).li(2, 7).out(1, 2).in(3, 1).halt();
    const { result, writes } = run(builder.build(), 100, {
      read: addr => (addr === 0x1000 ? 55 : 0),
      writes: [],
    });
    expect(writes).toEqual([[0x1000, 7]]);
    expect(result.vm.registers[3]).toBe(55);
  });

  it('instructionsPerTickの上限で停止する', () => {
    // 無限ループ（自分自身へのJMP）
    const builder = new ProgramBuilder();
    builder.mark('loop').jmpTo('loop');
    const { result } = run(builder.build(), 50);
    expect(result.instructionsExecuted).toBe(50);
    expect(result.hitLimit).toBe(true);
  });
});
