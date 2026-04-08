/**
 * Two-pass assembler for the v4 VM.
 *
 * Pass 1: collect labels and .equ constants, compute addresses.
 * Pass 2: emit binary 16-bit words.
 */

import {
  OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_MOD,
  OP_AND, OP_OR, OP_XOR, OP_SHL, OP_SHR,
  OP_IN, OP_OUT, OP_JALR,
  OP_ADDI, OP_LW, OP_SW, OP_PUSH, OP_POP,
  OP_BEQ, OP_BNE, OP_BLT, OP_BGE,
  OP_LI, OP_JMP,
  OP_BEQL, OP_BNEL, OP_BLTL, OP_BGEL,
  OP_HALT,
} from './opcodes.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssembleResult {
  readonly words: number[];
  readonly errors: string[];
  readonly labels: ReadonlyMap<string, number>;
}

interface Token {
  readonly text: string;
  readonly line: number;
}

type InstructionFormat = 'R' | 'I' | 'B' | 'W' | 'BL' | 'HALT';

interface InstructionDef {
  readonly opcode: number;
  readonly format: InstructionFormat;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGISTER_MAP: ReadonlyMap<string, number> = new Map([
  ['r0', 0], ['r1', 1], ['r2', 2], ['r3', 3],
  ['r4', 4], ['r5', 5], ['r6', 6], ['r7', 7],
  ['zero', 0], ['sp', 7],
]);

const INSTRUCTION_TABLE: ReadonlyMap<string, InstructionDef> = new Map([
  // Format R
  ['ADD',  { opcode: OP_ADD,  format: 'R' }],
  ['SUB',  { opcode: OP_SUB,  format: 'R' }],
  ['MUL',  { opcode: OP_MUL,  format: 'R' }],
  ['DIV',  { opcode: OP_DIV,  format: 'R' }],
  ['MOD',  { opcode: OP_MOD,  format: 'R' }],
  ['AND',  { opcode: OP_AND,  format: 'R' }],
  ['OR',   { opcode: OP_OR,   format: 'R' }],
  ['XOR',  { opcode: OP_XOR,  format: 'R' }],
  ['SHL',  { opcode: OP_SHL,  format: 'R' }],
  ['SHR',  { opcode: OP_SHR,  format: 'R' }],
  ['IN',   { opcode: OP_IN,   format: 'R' }],
  ['OUT',  { opcode: OP_OUT,  format: 'R' }],
  ['JALR', { opcode: OP_JALR, format: 'R' }],

  // Format I
  ['ADDI', { opcode: OP_ADDI, format: 'I' }],
  ['LW',   { opcode: OP_LW,   format: 'I' }],
  ['SW',   { opcode: OP_SW,   format: 'I' }],
  ['PUSH', { opcode: OP_PUSH, format: 'I' }],
  ['POP',  { opcode: OP_POP,  format: 'I' }],

  // Format B (short branch)
  ['BEQ',  { opcode: OP_BEQ,  format: 'B' }],
  ['BNE',  { opcode: OP_BNE,  format: 'B' }],
  ['BLT',  { opcode: OP_BLT,  format: 'B' }],
  ['BGE',  { opcode: OP_BGE,  format: 'B' }],

  // Format W (2-word)
  ['LI',   { opcode: OP_LI,   format: 'W' }],
  ['JMP',  { opcode: OP_JMP,  format: 'W' }],

  // Format BL (long branch, 2-word)
  ['BEQL', { opcode: OP_BEQL, format: 'BL' }],
  ['BNEL', { opcode: OP_BNEL, format: 'BL' }],
  ['BLTL', { opcode: OP_BLTL, format: 'BL' }],
  ['BGEL', { opcode: OP_BGEL, format: 'BL' }],

  // Special
  ['HALT', { opcode: OP_HALT, format: 'HALT' }],
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip comments and trim whitespace from a source line. */
function stripComment(line: string): string {
  // Handle semicolons inside strings if needed in the future. For now, simple.
  const idx = line.indexOf(';');
  return (idx >= 0 ? line.slice(0, idx) : line).trim();
}

/** Split an operand string like "r1, r2, r3" into individual tokens. */
function splitOperands(operandStr: string): string[] {
  if (operandStr.length === 0) return [];
  return operandStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/** Parse a register name, returning register number or undefined on error. */
function parseRegister(token: string): number | undefined {
  return REGISTER_MAP.get(token.toLowerCase());
}

/** Parse a numeric literal (decimal, hex 0x, binary 0b). Returns undefined on failure. */
function parseNumber(token: string): number | undefined {
  const s = token.trim();
  if (s.length === 0) return undefined;

  let value: number;
  if (s.startsWith('0x') || s.startsWith('0X')) {
    value = parseInt(s.slice(2), 16);
  } else if (s.startsWith('0b') || s.startsWith('0B')) {
    value = parseInt(s.slice(2), 2);
  } else {
    value = parseInt(s, 10);
  }

  return Number.isNaN(value) ? undefined : value;
}

/** Encode a Format R instruction word. */
function encodeR(opcode: number, rd: number, rs1: number, rs2: number): number {
  return ((opcode & 0x3F) << 10) | ((rd & 0x7) << 7) | ((rs1 & 0x7) << 4) | ((rs2 & 0x7) << 1);
}

/** Encode a Format I instruction word. */
function encodeI(opcode: number, rd: number, rs: number, imm4: number): number {
  return ((opcode & 0x3F) << 10) | ((rd & 0x7) << 7) | ((rs & 0x7) << 4) | (imm4 & 0xF);
}

/** Encode a Format B instruction word. */
function encodeB(opcode: number, rs1: number, rs2: number, offset: number): number {
  return ((opcode & 0x3F) << 10) | ((rs1 & 0x7) << 7) | ((rs2 & 0x7) << 4) | (offset & 0xF);
}

/** Encode word 1 of a Format W instruction. */
function encodeW1(opcode: number, rd: number, rs: number): number {
  return ((opcode & 0x3F) << 10) | ((rd & 0x7) << 7) | ((rs & 0x7) << 4);
}

/** Encode word 1 of a Format BL instruction. */
function encodeBL1(opcode: number, rs1: number, rs2: number): number {
  return ((opcode & 0x3F) << 10) | ((rs1 & 0x7) << 7) | ((rs2 & 0x7) << 4);
}

// ---------------------------------------------------------------------------
// Parsed source line
// ---------------------------------------------------------------------------

interface ParsedLine {
  readonly label: string | null;
  readonly mnemonic: string | null;
  readonly operands: string[];
  readonly line: number; // 1-based line number
}

function parseLine(raw: string, lineNumber: number): ParsedLine {
  const stripped = stripComment(raw);
  if (stripped.length === 0) return { label: null, mnemonic: null, operands: [], line: lineNumber };

  let rest = stripped;
  let label: string | null = null;

  // Check for label definition (ends with ':')
  const colonIdx = rest.indexOf(':');
  if (colonIdx >= 0) {
    const candidate = rest.slice(0, colonIdx).trim();
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(candidate)) {
      label = candidate;
      rest = rest.slice(colonIdx + 1).trim();
    }
  }

  if (rest.length === 0) return { label, mnemonic: null, operands: [], line: lineNumber };

  // Check for directive
  if (rest.startsWith('.')) {
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx < 0) {
      return { label, mnemonic: rest.toUpperCase(), operands: [], line: lineNumber };
    }
    const directive = rest.slice(0, spaceIdx).toLowerCase();
    const operandStr = rest.slice(spaceIdx + 1).trim();
    return { label, mnemonic: directive, operands: splitOperands(operandStr), line: lineNumber };
  }

  // Instruction: split mnemonic and operands
  const spaceIdx = rest.search(/\s/);
  if (spaceIdx < 0) {
    return { label, mnemonic: rest.toUpperCase(), operands: [], line: lineNumber };
  }
  const mnemonic = rest.slice(0, spaceIdx).toUpperCase();
  const operandStr = rest.slice(spaceIdx + 1).trim();
  return { label, mnemonic, operands: splitOperands(operandStr), line: lineNumber };
}

// ---------------------------------------------------------------------------
// Assembler
// ---------------------------------------------------------------------------

export function assemble(source: string): AssembleResult {
  const errors: string[] = [];
  const labels = new Map<string, number>();
  const equConstants = new Map<string, number>();

  // Pre-parse all lines
  const sourceLines = source.split('\n');
  const parsed: ParsedLine[] = sourceLines.map((raw, i) => parseLine(raw, i + 1));

  // Expand aliases in-place — transform MOV, NOP, RET, CALL, LA into real instructions
  const expanded = expandAliases(parsed, errors);

  // --- Pass 1: collect labels, compute addresses ---
  let addr = 0;
  for (const pl of expanded) {
    // Register label at current address
    if (pl.label !== null) {
      if (labels.has(pl.label) || equConstants.has(pl.label)) {
        errors.push(`Line ${pl.line}: duplicate label '${pl.label}'`);
      } else {
        labels.set(pl.label, addr);
      }
    }

    if (pl.mnemonic === null) continue;

    const mn = pl.mnemonic;

    // Directives
    if (mn === '.word') {
      addr += pl.operands.length;
    } else if (mn === '.zero') {
      const count = resolveImmediate(pl.operands[0], equConstants, labels);
      addr += (count !== undefined ? count : 0);
    } else if (mn === '.equ') {
      // .equ NAME, VALUE — define constant (does not consume address space)
      if (pl.operands.length >= 2) {
        const name = pl.operands[0];
        const val = parseNumber(pl.operands[1]);
        if (val !== undefined) {
          if (equConstants.has(name) || labels.has(name)) {
            errors.push(`Line ${pl.line}: duplicate constant '${name}'`);
          } else {
            equConstants.set(name, val);
          }
        } else {
          errors.push(`Line ${pl.line}: invalid value for .equ '${pl.operands[1]}'`);
        }
      } else {
        errors.push(`Line ${pl.line}: .equ requires NAME, VALUE`);
      }
    } else if (mn === '.org') {
      const target = resolveImmediate(pl.operands[0], equConstants, labels);
      if (target !== undefined) {
        if (target < addr) {
          errors.push(`Line ${pl.line}: .org target ${target} is before current address ${addr}`);
        } else {
          addr = target;
        }
      }
    } else if (mn === '.include') {
      // Not supported in this prototype
      errors.push(`Line ${pl.line}: .include is not supported in this assembler`);
    } else {
      // Instruction — determine size
      const def = INSTRUCTION_TABLE.get(mn);
      if (def) {
        const size = instructionSize(def.format);
        addr += size;
      } else {
        errors.push(`Line ${pl.line}: unknown instruction '${mn}'`);
      }
    }
  }

  // Early exit on pass-1 errors
  if (errors.length > 0) {
    return { words: [], errors, labels };
  }

  // --- Pass 2: emit binary ---
  const words: number[] = [];
  addr = 0;

  for (const pl of expanded) {
    if (pl.mnemonic === null) continue;

    const mn = pl.mnemonic;

    // Directives
    if (mn === '.word') {
      for (const op of pl.operands) {
        const v = resolveImmediate(op, equConstants, labels);
        if (v === undefined) {
          errors.push(`Line ${pl.line}: unresolved value '${op}'`);
          words.push(0);
        } else {
          words.push(v & 0xFFFF);
        }
        addr++;
      }
      continue;
    }
    if (mn === '.zero') {
      const count = resolveImmediate(pl.operands[0], equConstants, labels) ?? 0;
      for (let i = 0; i < count; i++) {
        words.push(0);
        addr++;
      }
      continue;
    }
    if (mn === '.equ') continue;
    if (mn === '.org') {
      const target = resolveImmediate(pl.operands[0], equConstants, labels) ?? addr;
      while (words.length < target) {
        words.push(0);
      }
      addr = target;
      continue;
    }

    const def = INSTRUCTION_TABLE.get(mn);
    if (!def) continue; // already reported in pass 1

    emitInstruction(def, pl, addr, labels, equConstants, words, errors);
    addr += instructionSize(def.format);
  }

  return { words, errors, labels };
}

// ---------------------------------------------------------------------------
// Alias expansion
// ---------------------------------------------------------------------------

function expandAliases(parsed: ParsedLine[], errors: string[]): ParsedLine[] {
  const result: ParsedLine[] = [];
  for (const pl of parsed) {
    if (pl.mnemonic === null) {
      result.push(pl);
      continue;
    }
    const mn = pl.mnemonic;

    if (mn === 'NOP') {
      // NOP -> ADD r0, r0, r0
      result.push({ ...pl, mnemonic: 'ADD', operands: ['r0', 'r0', 'r0'] });
    } else if (mn === 'MOV') {
      // MOV rd, rs -> ADD rd, rs, r0
      if (pl.operands.length < 2) {
        errors.push(`Line ${pl.line}: MOV requires 2 operands`);
        result.push(pl);
      } else {
        result.push({ ...pl, mnemonic: 'ADD', operands: [pl.operands[0], pl.operands[1], 'r0'] });
      }
    } else if (mn === 'RET') {
      // RET -> JALR r0, r6
      result.push({ ...pl, mnemonic: 'JALR', operands: ['r0', 'r6'] });
    } else if (mn === 'CALL') {
      // CALL rs -> JALR r6, rs
      if (pl.operands.length < 1) {
        errors.push(`Line ${pl.line}: CALL requires 1 operand`);
        result.push(pl);
      } else {
        result.push({ ...pl, mnemonic: 'JALR', operands: ['r6', pl.operands[0]] });
      }
    } else if (mn === 'LA') {
      // LA rd, label -> LI rd, label_address
      if (pl.operands.length < 2) {
        errors.push(`Line ${pl.line}: LA requires 2 operands`);
        result.push(pl);
      } else {
        result.push({ ...pl, mnemonic: 'LI', operands: [pl.operands[0], pl.operands[1]] });
      }
    } else {
      result.push(pl);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Instruction size
// ---------------------------------------------------------------------------

function instructionSize(format: InstructionFormat): number {
  switch (format) {
    case 'R': return 1;
    case 'I': return 1;
    case 'B': return 1;
    case 'W': return 2;
    case 'BL': return 2;
    case 'HALT': return 1;
  }
}

// ---------------------------------------------------------------------------
// Immediate / operand resolution
// ---------------------------------------------------------------------------

/** Resolve a token that could be a number, an .equ constant, or a label. */
function resolveImmediate(
  token: string,
  equConstants: ReadonlyMap<string, number>,
  labels: ReadonlyMap<string, number>,
): number | undefined {
  // Try number literal first
  const num = parseNumber(token);
  if (num !== undefined) return num;

  // Try .equ constant
  const equ = equConstants.get(token);
  if (equ !== undefined) return equ;

  // Try label
  const lbl = labels.get(token);
  if (lbl !== undefined) return lbl;

  return undefined;
}

// ---------------------------------------------------------------------------
// Instruction emission
// ---------------------------------------------------------------------------

function emitInstruction(
  def: InstructionDef,
  pl: ParsedLine,
  addr: number,
  labels: ReadonlyMap<string, number>,
  equConstants: ReadonlyMap<string, number>,
  words: number[],
  errors: string[],
): void {
  const ops = pl.operands;
  const ln = pl.line;

  switch (def.format) {
    case 'R': {
      emitFormatR(def.opcode, ops, ln, words, errors);
      break;
    }
    case 'I': {
      emitFormatI(def.opcode, pl.mnemonic!, ops, ln, equConstants, labels, words, errors);
      break;
    }
    case 'B': {
      emitFormatB(def.opcode, ops, ln, addr, equConstants, labels, words, errors);
      break;
    }
    case 'W': {
      emitFormatW(def.opcode, pl.mnemonic!, ops, ln, equConstants, labels, words, errors);
      break;
    }
    case 'BL': {
      emitFormatBL(def.opcode, ops, ln, equConstants, labels, words, errors);
      break;
    }
    case 'HALT': {
      // HALT: opcode 63, rest zeros
      words.push((OP_HALT & 0x3F) << 10);
      break;
    }
  }
}

function emitFormatR(
  opcode: number,
  ops: string[],
  ln: number,
  words: number[],
  errors: string[],
): void {
  // Most R-format: rd, rs1, rs2
  // Exceptions:
  //   IN rd, rs   (2 operands: rd, rs1. rs2=0)
  //   OUT rs1, rs2 (2 operands: rd=0, rs1, rs2)  — actually OUT rs1, rs2: rs1=addr, rs2=value
  //   JALR rd, rs (2 operands: rd, rs. rs2=0)

  if (opcode === OP_IN) {
    // IN rd, rs -> R format with rs2=0
    if (ops.length < 2) { errors.push(`Line ${ln}: IN requires 2 operands`); words.push(0); return; }
    const rd = requireReg(ops[0], ln, errors);
    const rs1 = requireReg(ops[1], ln, errors);
    words.push(encodeR(opcode, rd, rs1, 0));
    return;
  }

  if (opcode === OP_OUT) {
    // OUT rs1, rs2 -> R format with rd=0
    if (ops.length < 2) { errors.push(`Line ${ln}: OUT requires 2 operands`); words.push(0); return; }
    const rs1 = requireReg(ops[0], ln, errors);
    const rs2 = requireReg(ops[1], ln, errors);
    words.push(encodeR(opcode, 0, rs1, rs2));
    return;
  }

  if (opcode === OP_JALR) {
    // JALR rd, rs -> R format with rs2=0
    if (ops.length < 2) { errors.push(`Line ${ln}: JALR requires 2 operands`); words.push(0); return; }
    const rd = requireReg(ops[0], ln, errors);
    const rs1 = requireReg(ops[1], ln, errors);
    words.push(encodeR(opcode, rd, rs1, 0));
    return;
  }

  // Standard 3-register R format
  if (ops.length < 3) { errors.push(`Line ${ln}: instruction requires 3 operands`); words.push(0); return; }
  const rd = requireReg(ops[0], ln, errors);
  const rs1 = requireReg(ops[1], ln, errors);
  const rs2 = requireReg(ops[2], ln, errors);
  words.push(encodeR(opcode, rd, rs1, rs2));
}

function emitFormatI(
  opcode: number,
  mnemonic: string,
  ops: string[],
  ln: number,
  equConstants: ReadonlyMap<string, number>,
  labels: ReadonlyMap<string, number>,
  words: number[],
  errors: string[],
): void {
  if (opcode === OP_PUSH) {
    // PUSH rs — encoded as I-format with rd=0, rs, imm4=0
    if (ops.length < 1) { errors.push(`Line ${ln}: PUSH requires 1 operand`); words.push(0); return; }
    const rs = requireReg(ops[0], ln, errors);
    words.push(encodeI(opcode, 0, rs, 0));
    return;
  }

  if (opcode === OP_POP) {
    // POP rd — encoded as I-format with rd, rs=0, imm4=0
    if (ops.length < 1) { errors.push(`Line ${ln}: POP requires 1 operand`); words.push(0); return; }
    const rd = requireReg(ops[0], ln, errors);
    words.push(encodeI(opcode, rd, 0, 0));
    return;
  }

  // ADDI rd, rs, imm4 | LW rd, rs, imm4 | SW rs, rd, imm4
  if (ops.length < 3) { errors.push(`Line ${ln}: ${mnemonic} requires 3 operands`); words.push(0); return; }

  const reg1 = requireReg(ops[0], ln, errors);
  const reg2 = requireReg(ops[1], ln, errors);
  const immVal = resolveImmediate(ops[2], equConstants, labels);

  if (immVal === undefined) {
    errors.push(`Line ${ln}: unresolved immediate '${ops[2]}'`);
    words.push(0);
    return;
  }

  // imm4 is signed for ADDI/LW/SW: -8..+7
  if (immVal < -8 || immVal > 7) {
    errors.push(`Line ${ln}: immediate ${immVal} out of range for ${mnemonic} (must be -8..+7)`);
  }

  // Encode as unsigned 4 bits (two's complement)
  const imm4 = immVal & 0xF;
  words.push(encodeI(opcode, reg1, reg2, imm4));
}

function emitFormatB(
  opcode: number,
  ops: string[],
  ln: number,
  addr: number,
  equConstants: ReadonlyMap<string, number>,
  labels: ReadonlyMap<string, number>,
  words: number[],
  errors: string[],
): void {
  // BEQ rs1, rs2, offset_or_label
  if (ops.length < 3) { errors.push(`Line ${ln}: branch requires 3 operands`); words.push(0); return; }

  const rs1 = requireReg(ops[0], ln, errors);
  const rs2 = requireReg(ops[1], ln, errors);

  // The third operand can be a numeric offset or a label
  let offset: number;

  const numericOffset = parseNumber(ops[2]);
  if (numericOffset !== undefined) {
    // Explicit numeric offset (e.g. BEQ r1, r2, +2)
    offset = numericOffset;
  } else {
    // Label reference — compute offset
    const targetAddr = resolveImmediate(ops[2], equConstants, labels);
    if (targetAddr === undefined) {
      errors.push(`Line ${ln}: undefined label '${ops[2]}'`);
      words.push(0);
      return;
    }
    offset = targetAddr - addr;
  }

  if (offset < -8 || offset > 7) {
    errors.push(`Line ${ln}: short branch offset ${offset} out of range (-8..+7). Use long branch (BEQL/BNEL/BLTL/BGEL)`);
  }

  words.push(encodeB(opcode, rs1, rs2, offset & 0xF));
}

function emitFormatW(
  opcode: number,
  mnemonic: string,
  ops: string[],
  ln: number,
  equConstants: ReadonlyMap<string, number>,
  labels: ReadonlyMap<string, number>,
  words: number[],
  errors: string[],
): void {
  if (opcode === OP_JMP) {
    // JMP imm16 — rd=0, rs=0
    if (ops.length < 1) { errors.push(`Line ${ln}: JMP requires 1 operand`); words.push(0, 0); return; }
    const target = resolveImmediate(ops[0], equConstants, labels);
    if (target === undefined) {
      errors.push(`Line ${ln}: undefined label '${ops[0]}'`);
      words.push(0, 0);
      return;
    }
    words.push(encodeW1(opcode, 0, 0));
    words.push(target & 0xFFFF);
    return;
  }

  // LI rd, imm16
  if (ops.length < 2) { errors.push(`Line ${ln}: ${mnemonic} requires 2 operands`); words.push(0, 0); return; }
  const rd = requireReg(ops[0], ln, errors);
  const imm16 = resolveImmediate(ops[1], equConstants, labels);
  if (imm16 === undefined) {
    errors.push(`Line ${ln}: unresolved immediate '${ops[1]}'`);
    words.push(0, 0);
    return;
  }
  words.push(encodeW1(opcode, rd, 0));
  words.push(imm16 & 0xFFFF);
}

function emitFormatBL(
  opcode: number,
  ops: string[],
  ln: number,
  equConstants: ReadonlyMap<string, number>,
  labels: ReadonlyMap<string, number>,
  words: number[],
  errors: string[],
): void {
  // BEQL rs1, rs2, target
  if (ops.length < 3) { errors.push(`Line ${ln}: long branch requires 3 operands`); words.push(0, 0); return; }

  const rs1 = requireReg(ops[0], ln, errors);
  const rs2 = requireReg(ops[1], ln, errors);
  const target = resolveImmediate(ops[2], equConstants, labels);

  if (target === undefined) {
    errors.push(`Line ${ln}: undefined label '${ops[2]}'`);
    words.push(0, 0);
    return;
  }

  words.push(encodeBL1(opcode, rs1, rs2));
  words.push(target & 0xFFFF);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function requireReg(token: string, ln: number, errors: string[]): number {
  const r = parseRegister(token);
  if (r === undefined) {
    errors.push(`Line ${ln}: invalid register '${token}'`);
    return 0;
  }
  return r;
}
