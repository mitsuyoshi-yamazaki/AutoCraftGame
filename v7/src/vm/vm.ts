/**
 * VM Executor — 16-bit von Neumann architecture virtual machine
 *
 * Implements the instruction set defined in vm_spec.md.
 * All memory/register operations use immutable patterns.
 */

import type { VmState } from '../types.js';
import * as OP from './opcodes.js';

// --- Constants ---

export const INSTRUCTIONS_PER_TICK = 200;
export const WORD_MASK = 0xFFFF;
export const REGISTER_COUNT = 8;

// Magic operand pattern for CHECKPOINT.
// Random data has 1/1024 chance of matching this.
// Combined with the 1/64 opcode chance, accidental CHECKPOINT triggering
// has probability 1/65536 instead of 1/64.
export const CHECKPOINT_MAGIC = 0x2A5;
export const CHECKPOINT_WORD = (13 << 10) | CHECKPOINT_MAGIC;

// --- Opcode mapping (re-exported from opcodes.ts for compatibility) ---

export const Opcode = {
  ADD:  OP.OP_ADD,
  SUB:  OP.OP_SUB,
  MUL:  OP.OP_MUL,
  DIV:  OP.OP_DIV,
  MOD:  OP.OP_MOD,
  ADDI: OP.OP_ADDI,
  AND:  OP.OP_AND,
  OR:   OP.OP_OR,
  XOR:  OP.OP_XOR,
  SHL:  OP.OP_SHL,
  SHR:  OP.OP_SHR,
  LW:   OP.OP_LW,
  SW:   OP.OP_SW,
  LI:   OP.OP_LI,
  IN:   OP.OP_IN,
  OUT:  OP.OP_OUT,
  BEQ:  OP.OP_BEQ,
  BNE:  OP.OP_BNE,
  BLT:  OP.OP_BLT,
  BGE:  OP.OP_BGE,
  BEQL: OP.OP_BEQL,
  BNEL: OP.OP_BNEL,
  BLTL: OP.OP_BLTL,
  BGEL: OP.OP_BGEL,
  JMP:  OP.OP_JMP,
  JALR: OP.OP_JALR,
  PUSH: OP.OP_PUSH,
  POP:  OP.OP_POP,
  HALT: OP.OP_HALT,
  CHECKPOINT: OP.OP_CHECKPOINT,
} as const;

export type OpcodeValue = (typeof Opcode)[keyof typeof Opcode];

// --- Instruction decoding helpers ---

/** Extract opcode from instruction word (bits 15-10) */
const extractOpcode = (word: number): number => (word >> 10) & 0x3F;

/** Extract rd field (bits 9-7) */
const extractRd = (word: number): number => (word >> 7) & 0x7;

/** Extract rs1 field (bits 6-4) */
const extractRs1 = (word: number): number => (word >> 4) & 0x7;

/** Extract rs2 field (bits 3-1) */
const extractRs2 = (word: number): number => (word >> 1) & 0x7;

/** Extract imm4 as signed (bits 3-0, sign-extended from 4 bits) */
const extractImm4Signed = (word: number): number => {
  const raw = word & 0xF;
  return raw >= 8 ? raw - 16 : raw;
};

// --- Register helpers ---

/** Read register value. r0 always returns 0. */
const readReg = (registers: readonly number[], index: number): number =>
  index === 0 ? 0 : registers[index];

/** Write register value. Returns new registers array. r0 writes are discarded. */
const writeReg = (
  registers: readonly number[],
  index: number,
  value: number,
): readonly number[] => {
  if (index === 0) return registers;
  const next = [...registers];
  next[index] = value & WORD_MASK;
  return next;
};

// --- Memory helpers ---

/** Read memory with address wrapping */
const readMem = (memory: readonly number[], addr: number): number => {
  const wrapped = ((addr % memory.length) + memory.length) % memory.length;
  return memory[wrapped];
};

/** Write memory with address wrapping. Returns new memory array. */
const writeMem = (
  memory: readonly number[],
  addr: number,
  value: number,
): readonly number[] => {
  const wrapped = ((addr % memory.length) + memory.length) % memory.length;
  const next = [...memory];
  next[wrapped] = value & WORD_MASK;
  return next;
};

/** Wrap PC to memory size */
const wrapPc = (pc: number, memorySize: number): number => {
  const result = ((pc % memorySize) + memorySize) % memorySize;
  return result;
};

// --- VM creation ---

export const createVm = (memorySize: number): VmState => ({
  memory: new Array(memorySize).fill(0),
  registers: new Array(REGISTER_COUNT).fill(0),
  pc: 0,
  cp: 0,
  cpSet: false,
  active: false,
  localIdTable: new Map(),
  localIdCounter: 1,
});

// --- Program loading ---

export const loadProgram = (
  vm: VmState,
  program: readonly number[],
): VmState => {
  const memory = [...vm.memory];
  for (let i = 0; i < program.length; i++) {
    const addr = i % memory.length;
    memory[addr] = program[i] & WORD_MASK;
  }
  return { ...vm, memory };
};

// --- Instruction execution ---

interface ExecResult {
  readonly registers: readonly number[];
  readonly memory: readonly number[];
  readonly pc: number;
  readonly halted: boolean;
  readonly cpUpdate?: number;  // If set, this was a CHECKPOINT instruction; value is the new cp
}

/**
 * Execute a single instruction. Returns updated state.
 * ioRead/ioWrite callbacks handle I/O space access.
 */
const executeInstruction = (
  memory: readonly number[],
  registers: readonly number[],
  pc: number,
  ioRead: (addr: number) => number,
  ioWrite: (addr: number, value: number) => void,
): ExecResult => {
  const memSize = memory.length;
  const word = readMem(memory, pc);
  const opcode = extractOpcode(word);

  switch (opcode) {
    // --- Arithmetic (Format R) ---
    case Opcode.ADD: {
      const rd = extractRd(word);
      const rs1 = extractRs1(word);
      const rs2 = extractRs2(word);
      const val = (readReg(registers, rs1) + readReg(registers, rs2)) & WORD_MASK;
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.SUB: {
      const rd = extractRd(word);
      const rs1 = extractRs1(word);
      const rs2 = extractRs2(word);
      const val = (readReg(registers, rs1) - readReg(registers, rs2) + 0x10000) & WORD_MASK;
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.MUL: {
      const rd = extractRd(word);
      const rs1 = extractRs1(word);
      const rs2 = extractRs2(word);
      const val = (readReg(registers, rs1) * readReg(registers, rs2)) & WORD_MASK;
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.DIV: {
      const rd = extractRd(word);
      const rs1 = extractRs1(word);
      const rs2 = extractRs2(word);
      const divisor = readReg(registers, rs2);
      const val = divisor === 0 ? 0 : Math.floor(readReg(registers, rs1) / divisor);
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.MOD: {
      const rd = extractRd(word);
      const rs1 = extractRs1(word);
      const rs2 = extractRs2(word);
      const divisor = readReg(registers, rs2);
      const val = divisor === 0 ? 0 : readReg(registers, rs1) % divisor;
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }

    // --- Arithmetic (Format I) ---
    case Opcode.ADDI: {
      const rd = extractRd(word);
      const rs = extractRs1(word);
      const imm = extractImm4Signed(word);
      const val = (readReg(registers, rs) + imm + 0x10000) & WORD_MASK;
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }

    // --- Logic (Format R) ---
    case Opcode.AND: {
      const rd = extractRd(word);
      const rs1 = extractRs1(word);
      const rs2 = extractRs2(word);
      const val = readReg(registers, rs1) & readReg(registers, rs2);
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.OR: {
      const rd = extractRd(word);
      const rs1 = extractRs1(word);
      const rs2 = extractRs2(word);
      const val = readReg(registers, rs1) | readReg(registers, rs2);
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.XOR: {
      const rd = extractRd(word);
      const rs1 = extractRs1(word);
      const rs2 = extractRs2(word);
      const val = readReg(registers, rs1) ^ readReg(registers, rs2);
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.SHL: {
      const rd = extractRd(word);
      const rs1 = extractRs1(word);
      const rs2 = extractRs2(word);
      const shift = readReg(registers, rs2) % 16;
      const val = (readReg(registers, rs1) << shift) & WORD_MASK;
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.SHR: {
      const rd = extractRd(word);
      const rs1 = extractRs1(word);
      const rs2 = extractRs2(word);
      const shift = readReg(registers, rs2) % 16;
      const val = readReg(registers, rs1) >>> shift;
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }

    // --- Memory (Format I) ---
    case Opcode.LW: {
      const rd = extractRd(word);
      const rs = extractRs1(word);
      const imm = extractImm4Signed(word);
      const addr = readReg(registers, rs) + imm;
      const val = readMem(memory, addr);
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.SW: {
      // SW rs, rd, imm4 → mem[(rd + imm4)] = rs
      // In SW: bits 9-7 = rs (source value), bits 6-4 = rd (base address register)
      const rs = extractRd(word);   // bits 9-7: register whose value is stored
      const rd = extractRs1(word);  // bits 6-4: base address register
      const imm = extractImm4Signed(word);
      const addr = readReg(registers, rd) + imm;
      const val = readReg(registers, rs);
      return { registers, memory: writeMem(memory, addr, val), pc: wrapPc(pc + 1, memSize), halted: false };
    }

    // --- Memory (Format W) ---
    case Opcode.LI: {
      const rd = extractRd(word);
      const imm16 = readMem(memory, pc + 1);
      return { registers: writeReg(registers, rd, imm16), memory, pc: wrapPc(pc + 2, memSize), halted: false };
    }

    // --- I/O (Format R) ---
    case Opcode.IN: {
      const rd = extractRd(word);
      const rs = extractRs1(word);
      const ioAddr = readReg(registers, rs);
      const val = ioRead(ioAddr) & WORD_MASK;
      return { registers: writeReg(registers, rd, val), memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.OUT: {
      // OUT rs1, rs2 encoded as encodeR(op, 0, rs1, rs2)
      // rs1 (I/O address) = bits 6-4, rs2 (value) = bits 3-1
      const addrReg = extractRs1(word);  // bits 6-4: I/O address register
      const valReg = extractRs2(word);   // bits 3-1: value register
      ioWrite(readReg(registers, addrReg), readReg(registers, valReg));
      return { registers, memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }

    // --- Short branch (Format B) ---
    case Opcode.BEQ: {
      const rs1 = extractRd(word);   // bits 9-7
      const rs2 = extractRs1(word);  // bits 6-4
      const offset = extractImm4Signed(word);
      const taken = readReg(registers, rs1) === readReg(registers, rs2);
      const nextPc = taken ? pc + offset : pc + 1;
      return { registers, memory, pc: wrapPc(nextPc, memSize), halted: false };
    }
    case Opcode.BNE: {
      const rs1 = extractRd(word);
      const rs2 = extractRs1(word);
      const offset = extractImm4Signed(word);
      const taken = readReg(registers, rs1) !== readReg(registers, rs2);
      const nextPc = taken ? pc + offset : pc + 1;
      return { registers, memory, pc: wrapPc(nextPc, memSize), halted: false };
    }
    case Opcode.BLT: {
      const rs1 = extractRd(word);
      const rs2 = extractRs1(word);
      const offset = extractImm4Signed(word);
      const taken = readReg(registers, rs1) < readReg(registers, rs2);
      const nextPc = taken ? pc + offset : pc + 1;
      return { registers, memory, pc: wrapPc(nextPc, memSize), halted: false };
    }
    case Opcode.BGE: {
      const rs1 = extractRd(word);
      const rs2 = extractRs1(word);
      const offset = extractImm4Signed(word);
      const taken = readReg(registers, rs1) >= readReg(registers, rs2);
      const nextPc = taken ? pc + offset : pc + 1;
      return { registers, memory, pc: wrapPc(nextPc, memSize), halted: false };
    }

    // --- Long branch (Format BL) ---
    case Opcode.BEQL: {
      const rs1 = extractRd(word);
      const rs2 = extractRs1(word);
      const target = readMem(memory, pc + 1);
      const taken = readReg(registers, rs1) === readReg(registers, rs2);
      const nextPc = taken ? target : pc + 2;
      return { registers, memory, pc: wrapPc(nextPc, memSize), halted: false };
    }
    case Opcode.BNEL: {
      const rs1 = extractRd(word);
      const rs2 = extractRs1(word);
      const target = readMem(memory, pc + 1);
      const taken = readReg(registers, rs1) !== readReg(registers, rs2);
      const nextPc = taken ? target : pc + 2;
      return { registers, memory, pc: wrapPc(nextPc, memSize), halted: false };
    }
    case Opcode.BLTL: {
      const rs1 = extractRd(word);
      const rs2 = extractRs1(word);
      const target = readMem(memory, pc + 1);
      const taken = readReg(registers, rs1) < readReg(registers, rs2);
      const nextPc = taken ? target : pc + 2;
      return { registers, memory, pc: wrapPc(nextPc, memSize), halted: false };
    }
    case Opcode.BGEL: {
      const rs1 = extractRd(word);
      const rs2 = extractRs1(word);
      const target = readMem(memory, pc + 1);
      const taken = readReg(registers, rs1) >= readReg(registers, rs2);
      const nextPc = taken ? target : pc + 2;
      return { registers, memory, pc: wrapPc(nextPc, memSize), halted: false };
    }

    // --- Jump (Format W) ---
    case Opcode.JMP: {
      const target = readMem(memory, pc + 1);
      return { registers, memory, pc: wrapPc(target, memSize), halted: false };
    }

    // --- Jump register (Format R) ---
    case Opcode.JALR: {
      const rd = extractRd(word);
      const rs = extractRs1(word);
      const target = readReg(registers, rs);
      const returnAddr = (pc + 1) & WORD_MASK;
      const newRegs = writeReg(registers, rd, returnAddr);
      return { registers: newRegs, memory, pc: wrapPc(target, memSize), halted: false };
    }

    // --- Stack (Format I) ---
    case Opcode.PUSH: {
      // PUSH rs: r7 = (r7 - 1) mod 65536, mem[r7 % memSize] = rs
      // Encoded as encodeI(op, 0, rs, 0) → rs is in bits 6-4
      const rs = extractRs1(word);  // bits 6-4: source register
      const sp = (readReg(registers, 7) - 1 + 0x10000) & WORD_MASK;
      const regs = writeReg(registers, 7, sp);
      const newMem = writeMem(memory, sp, readReg(registers, rs));
      return { registers: regs, memory: newMem, pc: wrapPc(pc + 1, memSize), halted: false };
    }
    case Opcode.POP: {
      // POP rd: rd = mem[r7 % memSize], r7 = (r7 + 1) mod 65536
      const rd = extractRd(word);  // bits 9-7: destination register
      const sp = readReg(registers, 7);
      const val = readMem(memory, sp);
      const newSp = (sp + 1) & WORD_MASK;
      let regs = writeReg(registers, rd, val);
      regs = writeReg(regs, 7, newSp);
      return { registers: regs, memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }

    // --- HALT ---
    case Opcode.HALT: {
      return { registers, memory, pc: wrapPc(pc + 1, memSize), halted: true };
    }

    // --- CHECKPOINT ---
    // To minimize accidental triggering by corrupted memory,
    // CHECKPOINT requires a magic operand pattern (lower 10 bits = 0x2A5).
    // The full word value is (13 << 10) | 0x2A5 = 0x36A5.
    // Any opcode-13 word that does NOT match this magic pattern is treated as NOP.
    // This reduces the random-trigger probability from 1/64 to 1/65536.
    case Opcode.CHECKPOINT: {
      if ((word & 0x3FF) !== CHECKPOINT_MAGIC) {
        // Not a real CHECKPOINT — treat as NOP
        return { registers, memory, pc: wrapPc(pc + 1, memSize), halted: false };
      }
      const nextPc = wrapPc(pc + 1, memSize);
      return { registers, memory, pc: nextPc, halted: false, cpUpdate: nextPc };
    }

    // --- Invalid opcode = NOP ---
    default: {
      return { registers, memory, pc: wrapPc(pc + 1, memSize), halted: false };
    }
  }
};

// --- Tick execution ---

export interface TickExecResult {
  readonly vm: VmState;
  readonly instructionsExecuted: number;
  readonly hitLimit: boolean;
  readonly checkpointHit: boolean;  // Whether CHECKPOINT was executed this tick
}

/**
 * Execute up to maxInstructions instructions in one tick.
 *
 * Tick start behavior (方式A):
 *   If vm.cpSet is true, PC is reset to vm.cp at the start of the tick.
 *   Otherwise, PC continues from its previous value.
 *
 * Stops early on HALT. Returns updated VmState and execution stats.
 */
export const executeOneTick = (
  vm: VmState,
  ioRead: (addr: number) => number,
  ioWrite: (addr: number, value: number) => void,
  maxInstructions: number = INSTRUCTIONS_PER_TICK,
): TickExecResult => {
  let { memory, registers } = vm;
  // Tick-start PC reset: if a checkpoint has been set, resume from there
  let pc = vm.cpSet ? vm.cp : vm.pc;
  let cp = vm.cp;
  let cpSet = vm.cpSet;
  let count = 0;
  let halted = false;
  let checkpointHit = false;

  while (count < maxInstructions) {
    const result = executeInstruction(memory, registers, pc, ioRead, ioWrite);
    memory = result.memory;
    registers = result.registers;
    pc = result.pc;
    if (result.cpUpdate !== undefined) {
      cp = result.cpUpdate;
      cpSet = true;
      checkpointHit = true;
    }
    count++;

    if (result.halted) { halted = true; break; }
  }

  return {
    vm: { ...vm, memory, registers, pc, cp, cpSet },
    instructionsExecuted: count,
    hitLimit: !halted,
    checkpointHit,
  };
};

// --- Instruction encoding helpers (for tests and program assembly) ---

/** Encode Format R instruction */
export const encodeR = (
  opcode: number, rd: number, rs1: number, rs2: number,
): number =>
  ((opcode & 0x3F) << 10) | ((rd & 0x7) << 7) | ((rs1 & 0x7) << 4) | ((rs2 & 0x7) << 1);

/** Encode Format I instruction */
export const encodeI = (
  opcode: number, rd: number, rs: number, imm4: number,
): number =>
  ((opcode & 0x3F) << 10) | ((rd & 0x7) << 7) | ((rs & 0x7) << 4) | (imm4 & 0xF);

/** Encode Format W instruction (returns [word1, word2]) */
export const encodeW = (
  opcode: number, rd: number, rs: number, imm16: number,
): readonly [number, number] => [
  ((opcode & 0x3F) << 10) | ((rd & 0x7) << 7) | ((rs & 0x7) << 4),
  imm16 & WORD_MASK,
];

/** Encode Format B instruction */
export const encodeB = (
  opcode: number, rs1: number, rs2: number, offset: number,
): number =>
  ((opcode & 0x3F) << 10) | ((rs1 & 0x7) << 7) | ((rs2 & 0x7) << 4) | (offset & 0xF);

/** Encode Format BL instruction (returns [word1, word2]) */
export const encodeBL = (
  opcode: number, rs1: number, rs2: number, target: number,
): readonly [number, number] => [
  ((opcode & 0x3F) << 10) | ((rs1 & 0x7) << 7) | ((rs2 & 0x7) << 4),
  target & WORD_MASK,
];

/** Encode HALT instruction */
export const encodeHalt = (): number => (Opcode.HALT & 0x3F) << 10;

/** Encode CHECKPOINT instruction (uses magic operand pattern to resist random triggering) */
export const encodeCheckpoint = (): number => CHECKPOINT_WORD;
