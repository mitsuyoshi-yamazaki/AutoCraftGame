/**
 * プログラム組立ヘルパ。テスト・祖先種プログラムの記述用。
 * 名前付きジャンプ先のPC相対オフセットを自動解決する。
 */

import * as OP from './opcodes';
import { encodeB, encodeBL, encodeHalt, encodeI, encodeR, encodeW } from './vm';

interface Fixup {
  readonly wordIndex: number; // オフセットを書き込むワード位置
  readonly instrAddr: number; // PC相対の基準（命令自身のアドレス）
  readonly target: string;
}

export class ProgramBuilder {
  private readonly words: number[] = [];
  private readonly marks = new Map<string, number>();
  private readonly fixups: Fixup[] = [];

  get address(): number {
    return this.words.length;
  }

  raw(...values: number[]): this {
    this.words.push(...values.map(v => v & 0xffff));
    return this;
  }

  /** 現在位置に名前をつける（分岐先） */
  mark(name: string): this {
    this.marks.set(name, this.words.length);
    return this;
  }

  li(rd: number, imm16: number): this {
    return this.raw(...encodeW(OP.OP_LI, rd, 0, imm16));
  }

  add(rd: number, rs1: number, rs2: number): this {
    return this.raw(encodeR(OP.OP_ADD, rd, rs1, rs2));
  }

  sub(rd: number, rs1: number, rs2: number): this {
    return this.raw(encodeR(OP.OP_SUB, rd, rs1, rs2));
  }

  mul(rd: number, rs1: number, rs2: number): this {
    return this.raw(encodeR(OP.OP_MUL, rd, rs1, rs2));
  }

  mod(rd: number, rs1: number, rs2: number): this {
    return this.raw(encodeR(OP.OP_MOD, rd, rs1, rs2));
  }

  and(rd: number, rs1: number, rs2: number): this {
    return this.raw(encodeR(OP.OP_AND, rd, rs1, rs2));
  }

  or(rd: number, rs1: number, rs2: number): this {
    return this.raw(encodeR(OP.OP_OR, rd, rs1, rs2));
  }

  xor(rd: number, rs1: number, rs2: number): this {
    return this.raw(encodeR(OP.OP_XOR, rd, rs1, rs2));
  }

  shl(rd: number, rs1: number, rs2: number): this {
    return this.raw(encodeR(OP.OP_SHL, rd, rs1, rs2));
  }

  shr(rd: number, rs1: number, rs2: number): this {
    return this.raw(encodeR(OP.OP_SHR, rd, rs1, rs2));
  }

  addi(rd: number, rs: number, imm4: number): this {
    return this.raw(encodeI(OP.OP_ADDI, rd, rs, imm4));
  }

  lw(rd: number, rs: number, imm4 = 0): this {
    return this.raw(encodeI(OP.OP_LW, rd, rs, imm4));
  }

  sw(rsValue: number, rdBase: number, imm4 = 0): this {
    return this.raw(encodeI(OP.OP_SW, rsValue, rdBase, imm4));
  }

  in(rd: number, rsAddr: number): this {
    return this.raw(encodeR(OP.OP_IN, rd, rsAddr, 0));
  }

  out(rsAddr: number, rsValue: number): this {
    return this.raw(encodeR(OP.OP_OUT, 0, rsAddr, rsValue));
  }

  beq(rs1: number, rs2: number, offset: number): this {
    return this.raw(encodeB(OP.OP_BEQ, rs1, rs2, offset));
  }

  /** 名前付き分岐（長形式・PC相対） */
  private branchTo(opcode: number, rs1: number, rs2: number, target: string): this {
    const instrAddr = this.words.length;
    this.fixups.push({ wordIndex: instrAddr + 1, instrAddr, target });
    return this.raw(...encodeBL(opcode, rs1, rs2, 0));
  }

  beqlTo(rs1: number, rs2: number, target: string): this {
    return this.branchTo(OP.OP_BEQL, rs1, rs2, target);
  }

  bnelTo(rs1: number, rs2: number, target: string): this {
    return this.branchTo(OP.OP_BNEL, rs1, rs2, target);
  }

  bltlTo(rs1: number, rs2: number, target: string): this {
    return this.branchTo(OP.OP_BLTL, rs1, rs2, target);
  }

  bgelTo(rs1: number, rs2: number, target: string): this {
    return this.branchTo(OP.OP_BGEL, rs1, rs2, target);
  }

  jmpTo(target: string): this {
    const instrAddr = this.words.length;
    this.fixups.push({ wordIndex: instrAddr + 1, instrAddr, target });
    return this.raw(...encodeW(OP.OP_JMP, 0, 0, 0));
  }

  halt(): this {
    return this.raw(encodeHalt());
  }

  build(): number[] {
    const result = [...this.words];
    for (const fixup of this.fixups) {
      const targetAddr = this.marks.get(fixup.target);
      if (targetAddr === undefined) {
        throw new Error(`未定義の分岐先: ${fixup.target}`);
      }
      result[fixup.wordIndex] = (targetAddr - fixup.instrAddr) & 0xffff;
    }
    return result;
  }
}
