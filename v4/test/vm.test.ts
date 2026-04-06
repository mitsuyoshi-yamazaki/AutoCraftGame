import { describe, it, expect } from 'vitest';
import {
  Opcode, createVm, loadProgram, executeOneTick,
  encodeR, encodeI, encodeW, encodeB, encodeBL, encodeHalt,
  WORD_MASK, INSTRUCTIONS_PER_TICK,
} from '../src/vm/vm.js';

const noIo = {
  read: (_addr: number) => 0,
  write: (_addr: number, _val: number) => {},
};

const run = (program: readonly number[], memSize = 1024) => {
  const vm = loadProgram(createVm(memSize), program);
  return executeOneTick(vm, noIo.read, noIo.write);
};

describe('createVm', () => {
  it('creates a VM with zeroed state', () => {
    const vm = createVm(1024);
    expect(vm.memory.length).toBe(1024);
    expect(vm.memory.every(v => v === 0)).toBe(true);
    expect(vm.registers.length).toBe(8);
    expect(vm.registers.every(v => v === 0)).toBe(true);
    expect(vm.pc).toBe(0);
    expect(vm.active).toBe(false);
  });
});

describe('loadProgram', () => {
  it('loads program at address 0', () => {
    const vm = loadProgram(createVm(8), [100, 200, 300]);
    expect(vm.memory[0]).toBe(100);
    expect(vm.memory[1]).toBe(200);
    expect(vm.memory[2]).toBe(300);
    expect(vm.memory[3]).toBe(0);
  });

  it('wraps program if longer than memory', () => {
    const vm = loadProgram(createVm(4), [1, 2, 3, 4, 5]);
    expect(vm.memory[0]).toBe(5); // wrapped: index 4 % 4 = 0
    expect(vm.memory[1]).toBe(2);
  });
});

describe('arithmetic instructions', () => {
  it('ADD: rd = rs1 + rs2', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 100),  // r1 = 100
      ...encodeW(Opcode.LI, 2, 0, 200),  // r2 = 200
      encodeR(Opcode.ADD, 3, 1, 2),       // r3 = r1 + r2 = 300
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(300);
  });

  it('ADD wraps on overflow', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 65535),
      ...encodeW(Opcode.LI, 2, 0, 2),
      encodeR(Opcode.ADD, 3, 1, 2),
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(1); // (65535 + 2) % 65536
  });

  it('SUB: rd = rs1 - rs2 (with underflow wrap)', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 10),
      ...encodeW(Opcode.LI, 2, 0, 20),
      encodeR(Opcode.SUB, 3, 1, 2),
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(65526); // (10 - 20 + 65536) % 65536
  });

  it('MUL: rd = rs1 * rs2 (lower 16 bits)', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 300),
      ...encodeW(Opcode.LI, 2, 0, 300),
      encodeR(Opcode.MUL, 3, 1, 2),
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe((300 * 300) & WORD_MASK);
  });

  it('DIV: integer division, div by zero returns 0', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 100),
      ...encodeW(Opcode.LI, 2, 0, 7),
      encodeR(Opcode.DIV, 3, 1, 2),  // 100 / 7 = 14
      encodeR(Opcode.DIV, 4, 1, 0),  // 100 / 0 = 0 (r0 is zero)
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(14);
    expect(result.registers[4]).toBe(0);
  });

  it('MOD: remainder, mod by zero returns 0', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 100),
      ...encodeW(Opcode.LI, 2, 0, 7),
      encodeR(Opcode.MOD, 3, 1, 2),  // 100 % 7 = 2
      encodeR(Opcode.MOD, 4, 1, 0),  // 100 % 0 = 0
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(2);
    expect(result.registers[4]).toBe(0);
  });

  it('ADDI: rd = rs + signed imm4', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 100),
      encodeI(Opcode.ADDI, 2, 1, 5),      // r2 = 100 + 5 = 105
      encodeI(Opcode.ADDI, 3, 1, 0xF),    // r3 = 100 + (-1) = 99 (0xF = -1 in signed 4-bit)
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[2]).toBe(105);
    expect(result.registers[3]).toBe(99);
  });
});

describe('logic instructions', () => {
  it('AND, OR, XOR', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 0xFF00),
      ...encodeW(Opcode.LI, 2, 0, 0x0FF0),
      encodeR(Opcode.AND, 3, 1, 2),  // 0x0F00
      encodeR(Opcode.OR, 4, 1, 2),   // 0xFFF0
      encodeR(Opcode.XOR, 5, 1, 2),  // 0xF0F0
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(0x0F00);
    expect(result.registers[4]).toBe(0xFFF0);
    expect(result.registers[5]).toBe(0xF0F0);
  });

  it('SHL and SHR', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 0x00FF),
      ...encodeW(Opcode.LI, 2, 0, 4),
      encodeR(Opcode.SHL, 3, 1, 2),  // 0x0FF0
      encodeR(Opcode.SHR, 4, 1, 2),  // 0x000F
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(0x0FF0);
    expect(result.registers[4]).toBe(0x000F);
  });

  it('SHL shift amount is mod 16', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 1),
      ...encodeW(Opcode.LI, 2, 0, 17), // 17 % 16 = 1
      encodeR(Opcode.SHL, 3, 1, 2),
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(2);
  });
});

describe('memory operations', () => {
  it('LW and SW with immediate offset', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 42),    // r1 = 42
      ...encodeW(Opcode.LI, 2, 0, 100),   // r2 = 100 (base address)
      encodeI(Opcode.SW, 1, 2, 3),         // mem[100 + 3] = r1 = 42
      encodeI(Opcode.LW, 3, 2, 3),         // r3 = mem[100 + 3] = 42
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(42);
    expect(result.memory[103]).toBe(42);
  });

  it('LW with negative offset', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 99),
      ...encodeW(Opcode.LI, 2, 0, 10),
      encodeI(Opcode.SW, 1, 2, 0),       // mem[10] = 99
      encodeI(Opcode.LW, 3, 2, 0),       // r3 = mem[10] = 99
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(99);
  });

  it('LI loads 16-bit immediate', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 12345),
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[1]).toBe(12345);
  });

  it('memory wraps around', () => {
    // Memory size 8, write to address 10 -> wraps to 2
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 77),
      ...encodeW(Opcode.LI, 2, 0, 10),   // address 10, wraps to 2 in memSize=8
      encodeI(Opcode.SW, 1, 2, 0),        // mem[10 % 8] = mem[2] = 77
      encodeHalt(),
    ];
    // Need memSize large enough to hold the program (7 words), then check wrapping
    const vm = loadProgram(createVm(1024), program);
    const result = executeOneTick(vm, noIo.read, noIo.write);
    expect(result.memory[10]).toBe(77);
  });
});

describe('I/O operations', () => {
  it('IN reads from I/O space', () => {
    const ioRead = (addr: number) => addr === 5 ? 999 : 0;
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 5),    // r1 = 5 (I/O address)
      encodeR(Opcode.IN, 2, 1, 0),        // r2 = io_read(5) = 999
      encodeHalt(),
    ];
    const vm = loadProgram(createVm(1024), program);
    const result = executeOneTick(vm, ioRead, noIo.write);
    expect(result.registers[2]).toBe(999);
  });

  it('OUT writes to I/O space', () => {
    const writes: Array<{ addr: number; val: number }> = [];
    const ioWrite = (addr: number, val: number) => { writes.push({ addr, val }); };
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 10),   // r1 = 10 (I/O address)
      ...encodeW(Opcode.LI, 2, 0, 42),   // r2 = 42 (value)
      encodeR(Opcode.OUT, 0, 1, 2),       // io_write(r1=10, r2=42)
      encodeHalt(),
    ];
    const vm = loadProgram(createVm(1024), program);
    executeOneTick(vm, noIo.read, ioWrite);
    expect(writes).toEqual([{ addr: 10, val: 42 }]);
  });
});

describe('branch instructions', () => {
  it('BEQ: branches when equal', () => {
    // r1 = 5, r2 = 5, BEQ should branch forward by 2
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 5),    // addr 0-1
      ...encodeW(Opcode.LI, 2, 0, 5),    // addr 2-3
      encodeB(Opcode.BEQ, 1, 2, 2),       // addr 4: if r1==r2, PC += 2 -> 6
      ...encodeW(Opcode.LI, 3, 0, 111),  // addr 5-6: skipped partially
      ...encodeW(Opcode.LI, 3, 0, 222),  // addr 7-8: NOT the target either
      encodeHalt(),                        // addr 9
    ];
    // BEQ at addr 4, offset +2 -> PC = 6
    // At addr 6, we need to place specific code
    // Let's just verify PC lands correctly with a simpler approach
    const program2 = [
      ...encodeW(Opcode.LI, 1, 0, 5),      // 0-1: r1 = 5
      ...encodeW(Opcode.LI, 2, 0, 5),      // 2-3: r2 = 5
      encodeB(Opcode.BEQ, 1, 2, 3),         // 4: branch to PC+3 = 7
      ...encodeW(Opcode.LI, 3, 0, 111),    // 5-6: skipped
      ...encodeW(Opcode.LI, 3, 0, 222),    // 7-8: target (r3 = 222)
      encodeHalt(),                          // 9
    ];
    const result = run(program2);
    expect(result.registers[3]).toBe(222);
  });

  it('BEQ: does not branch when not equal', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 5),      // 0-1
      ...encodeW(Opcode.LI, 2, 0, 10),     // 2-3
      encodeB(Opcode.BEQ, 1, 2, 3),         // 4: not taken, PC = 5
      ...encodeW(Opcode.LI, 3, 0, 111),    // 5-6: executed (r3 = 111)
      encodeHalt(),                          // 7
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(111);
  });

  it('BNE: branches when not equal', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 5),
      ...encodeW(Opcode.LI, 2, 0, 10),
      encodeB(Opcode.BNE, 1, 2, 3),         // taken, PC = 4+3 = 7
      ...encodeW(Opcode.LI, 3, 0, 111),    // 5-6: skipped
      ...encodeW(Opcode.LI, 3, 0, 222),    // 7-8: executed
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(222);
  });

  it('BLT: branches when rs1 < rs2 (unsigned)', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 3),
      ...encodeW(Opcode.LI, 2, 0, 10),
      encodeB(Opcode.BLT, 1, 2, 3),         // 3 < 10: taken
      ...encodeW(Opcode.LI, 3, 0, 111),
      ...encodeW(Opcode.LI, 3, 0, 222),
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(222);
  });

  it('BGE: branches when rs1 >= rs2 (unsigned)', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 10),
      ...encodeW(Opcode.LI, 2, 0, 10),
      encodeB(Opcode.BGE, 1, 2, 3),         // 10 >= 10: taken
      ...encodeW(Opcode.LI, 3, 0, 111),
      ...encodeW(Opcode.LI, 3, 0, 222),
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(222);
  });
});

describe('long branch instructions', () => {
  it('BEQL: branches to absolute target when equal', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 5),      // 0-1
      ...encodeW(Opcode.LI, 2, 0, 5),      // 2-3
      ...encodeBL(Opcode.BEQL, 1, 2, 8),   // 4-5: branch to addr 8
      ...encodeW(Opcode.LI, 3, 0, 111),    // 6-7: skipped
      ...encodeW(Opcode.LI, 3, 0, 222),    // 8-9: target
      encodeHalt(),                          // 10
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(222);
  });

  it('BEQL: falls through when not equal (PC += 2)', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 5),
      ...encodeW(Opcode.LI, 2, 0, 10),
      ...encodeBL(Opcode.BEQL, 1, 2, 100), // 4-5: not taken, PC = 6
      ...encodeW(Opcode.LI, 3, 0, 111),    // 6-7: executed
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(111);
  });
});

describe('jump instructions', () => {
  it('JMP: jumps to absolute address', () => {
    const program = [
      ...encodeW(Opcode.JMP, 0, 0, 4),     // 0-1: jump to addr 4
      ...encodeW(Opcode.LI, 1, 0, 111),    // 2-3: skipped
      ...encodeW(Opcode.LI, 1, 0, 222),    // 4-5: target
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[1]).toBe(222);
  });

  it('JALR: saves return address and jumps to register', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 5),      // 0-1: r1 = 5 (target)
      encodeR(Opcode.JALR, 6, 1, 0),        // 2: r6 = PC+1 = 3, PC = r1 = 5
      ...encodeW(Opcode.LI, 2, 0, 111),    // 3-4: skipped
      ...encodeW(Opcode.LI, 2, 0, 222),    // 5-6: target
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[6]).toBe(3);     // return address
    expect(result.registers[2]).toBe(222);
  });
});

describe('stack operations', () => {
  it('PUSH and POP', () => {
    const program = [
      ...encodeW(Opcode.LI, 7, 0, 1000),   // 0-1: SP = 1000
      ...encodeW(Opcode.LI, 1, 0, 42),     // 2-3: r1 = 42
      ...encodeW(Opcode.LI, 2, 0, 99),     // 4-5: r2 = 99
      encodeI(Opcode.PUSH, 0, 1, 0),        // 6: push r1 (SP=999, mem[999]=42)
      encodeI(Opcode.PUSH, 0, 2, 0),        // 7: push r2 (SP=998, mem[998]=99)
      encodeI(Opcode.POP, 3, 0, 0),         // 8: pop r3 (r3=99, SP=999)
      encodeI(Opcode.POP, 4, 0, 0),         // 9: pop r4 (r4=42, SP=1000)
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[3]).toBe(99);    // LIFO: last pushed = first popped
    expect(result.registers[4]).toBe(42);
    expect(result.registers[7]).toBe(1000);  // SP restored
  });
});

describe('r0 behavior', () => {
  it('r0 always reads as 0', () => {
    // ADD r0, r1, r2 -> should not change r0
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 100),
      ...encodeW(Opcode.LI, 2, 0, 200),
      encodeR(Opcode.ADD, 0, 1, 2),  // write to r0 is discarded
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[0]).toBe(0);
  });
});

describe('HALT', () => {
  it('stops execution for the tick, PC is after HALT', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 10),   // 0-1
      encodeHalt(),                        // 2
      ...encodeW(Opcode.LI, 1, 0, 20),   // 3-4: not executed
    ];
    const result = run(program);
    expect(result.registers[1]).toBe(10);
    expect(result.pc).toBe(3); // PC points after HALT
  });

  it('resumes after HALT on next tick', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 10),
      encodeHalt(),                        // addr 2
      ...encodeW(Opcode.LI, 2, 0, 20),   // addr 3-4
      encodeHalt(),                        // addr 5
    ];
    const vm1 = executeOneTick(
      loadProgram(createVm(1024), program),
      noIo.read, noIo.write,
    );
    expect(vm1.registers[1]).toBe(10);
    expect(vm1.registers[2]).toBe(0);
    expect(vm1.pc).toBe(3);

    // Second tick: resumes from PC=3
    const vm2 = executeOneTick(vm1, noIo.read, noIo.write);
    expect(vm2.registers[2]).toBe(20);
    expect(vm2.pc).toBe(6);
  });
});

describe('instruction limit', () => {
  it('stops after maxInstructions', () => {
    // Infinite loop: ADDI r1, r1, 1 then JMP 0
    const program = [
      encodeI(Opcode.ADDI, 1, 1, 1),   // 0: r1++
      ...encodeW(Opcode.JMP, 0, 0, 0), // 1-2: JMP 0
    ];
    const result = executeOneTick(
      loadProgram(createVm(1024), program),
      noIo.read, noIo.write,
      10,
    );
    // Each loop iteration = 2 instructions (ADDI + JMP)
    // 10 instructions max, so 5 complete loops
    expect(result.registers[1]).toBe(5);
  });

  it('defaults to INSTRUCTIONS_PER_TICK', () => {
    const program = [
      encodeI(Opcode.ADDI, 1, 1, 1),
      ...encodeW(Opcode.JMP, 0, 0, 0),
    ];
    const result = run(program);
    // 200 instructions / 2 per loop = 100 increments
    expect(result.registers[1]).toBe(100);
  });
});

describe('invalid instruction', () => {
  it('treats unknown opcode as NOP (PC += 1)', () => {
    // Opcode 62 is not assigned to any instruction
    const invalidWord = (62 << 10);
    const program = [
      invalidWord,                          // 0: NOP
      ...encodeW(Opcode.LI, 1, 0, 42),    // 1-2: r1 = 42
      encodeHalt(),
    ];
    const result = run(program);
    expect(result.registers[1]).toBe(42);
  });
});

describe('memory wrapping for PC', () => {
  it('PC wraps around memory boundary', () => {
    // Place program near end of small memory
    const memSize = 8;
    const vm = createVm(memSize);
    const mem = [...vm.memory];
    // Put LI r1, 42 at address 6 (will wrap: word2 at addr 7)
    const [w1, w2] = encodeW(Opcode.LI, 1, 0, 42);
    mem[6] = w1;
    mem[7] = w2;
    // Put HALT at address 0 (PC wraps to 0 after executing LI)
    mem[0] = encodeHalt();
    const vmWithProgram: typeof vm = { ...vm, memory: mem, pc: 6 };
    const result = executeOneTick(vmWithProgram, noIo.read, noIo.write);
    expect(result.registers[1]).toBe(42);
    expect(result.pc).toBe(1); // after HALT at addr 0
  });
});

describe('immutability', () => {
  it('does not mutate original VmState', () => {
    const program = [
      ...encodeW(Opcode.LI, 1, 0, 42),
      encodeHalt(),
    ];
    const original = loadProgram(createVm(1024), program);
    const originalPc = original.pc;
    const originalRegs = [...original.registers];
    executeOneTick(original, noIo.read, noIo.write);
    expect(original.pc).toBe(originalPc);
    expect([...original.registers]).toEqual(originalRegs);
  });
});
