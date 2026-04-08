import { describe, it, expect } from 'vitest';
import { assemble } from '../src/vm/assembler.js';
import {
  OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_MOD,
  OP_AND, OP_OR, OP_XOR, OP_SHL, OP_SHR,
  OP_IN, OP_OUT, OP_JALR,
  OP_ADDI, OP_LW, OP_SW, OP_PUSH, OP_POP,
  OP_BEQ, OP_BNE, OP_BLT, OP_BGE,
  OP_LI, OP_JMP,
  OP_BEQL, OP_BNEL, OP_BLTL, OP_BGEL,
  OP_HALT, OP_CHECKPOINT,
} from '../src/vm/opcodes.js';

/** Decode Format R from a 16-bit word */
function decodeR(word: number) {
  return {
    opcode: (word >> 10) & 0x3F,
    rd: (word >> 7) & 0x7,
    rs1: (word >> 4) & 0x7,
    rs2: (word >> 1) & 0x7,
  };
}

/** Decode Format I from a 16-bit word */
function decodeI(word: number) {
  const raw = word & 0xF;
  return {
    opcode: (word >> 10) & 0x3F,
    rd: (word >> 7) & 0x7,
    rs: (word >> 4) & 0x7,
    imm4: raw >= 8 ? raw - 16 : raw, // sign-extend
    imm4_raw: raw,
  };
}

/** Decode Format B from a 16-bit word */
function decodeB(word: number) {
  const raw = word & 0xF;
  return {
    opcode: (word >> 10) & 0x3F,
    rs1: (word >> 7) & 0x7,
    rs2: (word >> 4) & 0x7,
    offset: raw >= 8 ? raw - 16 : raw,
    offset_raw: raw,
  };
}

describe('assembler', () => {
  describe('Format R instructions', () => {
    it('assembles ADD r1, r2, r3', () => {
      const result = assemble('ADD r1, r2, r3');
      expect(result.errors).toEqual([]);
      expect(result.words).toHaveLength(1);
      const d = decodeR(result.words[0]);
      expect(d.opcode).toBe(OP_ADD);
      expect(d.rd).toBe(1);
      expect(d.rs1).toBe(2);
      expect(d.rs2).toBe(3);
    });

    it('assembles SUB r4, r5, r6', () => {
      const result = assemble('SUB r4, r5, r6');
      expect(result.errors).toEqual([]);
      const d = decodeR(result.words[0]);
      expect(d.opcode).toBe(OP_SUB);
      expect(d.rd).toBe(4);
      expect(d.rs1).toBe(5);
      expect(d.rs2).toBe(6);
    });

    it('assembles all arithmetic R-format', () => {
      for (const [mn, op] of [['MUL', OP_MUL], ['DIV', OP_DIV], ['MOD', OP_MOD]] as const) {
        const result = assemble(`${mn} r1, r2, r3`);
        expect(result.errors).toEqual([]);
        expect(decodeR(result.words[0]).opcode).toBe(op);
      }
    });

    it('assembles logic R-format', () => {
      for (const [mn, op] of [['AND', OP_AND], ['OR', OP_OR], ['XOR', OP_XOR], ['SHL', OP_SHL], ['SHR', OP_SHR]] as const) {
        const result = assemble(`${mn} r1, r2, r3`);
        expect(result.errors).toEqual([]);
        expect(decodeR(result.words[0]).opcode).toBe(op);
      }
    });

    it('assembles IN rd, rs', () => {
      const result = assemble('IN r1, r2');
      expect(result.errors).toEqual([]);
      const d = decodeR(result.words[0]);
      expect(d.opcode).toBe(OP_IN);
      expect(d.rd).toBe(1);
      expect(d.rs1).toBe(2);
      expect(d.rs2).toBe(0);
    });

    it('assembles OUT rs1, rs2', () => {
      const result = assemble('OUT r3, r4');
      expect(result.errors).toEqual([]);
      const d = decodeR(result.words[0]);
      expect(d.opcode).toBe(OP_OUT);
      expect(d.rd).toBe(0);
      expect(d.rs1).toBe(3);
      expect(d.rs2).toBe(4);
    });

    it('assembles JALR rd, rs', () => {
      const result = assemble('JALR r6, r1');
      expect(result.errors).toEqual([]);
      const d = decodeR(result.words[0]);
      expect(d.opcode).toBe(OP_JALR);
      expect(d.rd).toBe(6);
      expect(d.rs1).toBe(1);
    });
  });

  describe('Format I instructions', () => {
    it('assembles ADDI with positive immediate', () => {
      const result = assemble('ADDI r1, r2, 5');
      expect(result.errors).toEqual([]);
      const d = decodeI(result.words[0]);
      expect(d.opcode).toBe(OP_ADDI);
      expect(d.rd).toBe(1);
      expect(d.rs).toBe(2);
      expect(d.imm4).toBe(5);
    });

    it('assembles ADDI with negative immediate', () => {
      const result = assemble('ADDI r1, r2, -3');
      expect(result.errors).toEqual([]);
      const d = decodeI(result.words[0]);
      expect(d.opcode).toBe(OP_ADDI);
      expect(d.imm4).toBe(-3);
    });

    it('assembles LW rd, rs, imm4', () => {
      const result = assemble('LW r3, r7, -1');
      expect(result.errors).toEqual([]);
      const d = decodeI(result.words[0]);
      expect(d.opcode).toBe(OP_LW);
      expect(d.rd).toBe(3);
      expect(d.rs).toBe(7);
      expect(d.imm4).toBe(-1);
    });

    it('assembles SW rs, rd, imm4', () => {
      const result = assemble('SW r1, r2, 3');
      expect(result.errors).toEqual([]);
      const d = decodeI(result.words[0]);
      expect(d.opcode).toBe(OP_SW);
      expect(d.rd).toBe(1);
      expect(d.rs).toBe(2);
      expect(d.imm4).toBe(3);
    });

    it('assembles PUSH rs', () => {
      const result = assemble('PUSH r3');
      expect(result.errors).toEqual([]);
      const d = decodeI(result.words[0]);
      expect(d.opcode).toBe(OP_PUSH);
      expect(d.rs).toBe(3);
    });

    it('assembles POP rd', () => {
      const result = assemble('POP r4');
      expect(result.errors).toEqual([]);
      const d = decodeI(result.words[0]);
      expect(d.opcode).toBe(OP_POP);
      expect(d.rd).toBe(4);
    });

    it('rejects immediate out of range', () => {
      const result = assemble('ADDI r1, r2, 10');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('out of range');
    });
  });

  describe('Format B instructions (short branch)', () => {
    it('assembles BEQ with numeric offset', () => {
      const result = assemble('BEQ r1, r2, 3');
      expect(result.errors).toEqual([]);
      const d = decodeB(result.words[0]);
      expect(d.opcode).toBe(OP_BEQ);
      expect(d.rs1).toBe(1);
      expect(d.rs2).toBe(2);
      expect(d.offset).toBe(3);
    });

    it('assembles BNE with negative offset', () => {
      const result = assemble('BNE r3, r4, -2');
      expect(result.errors).toEqual([]);
      const d = decodeB(result.words[0]);
      expect(d.opcode).toBe(OP_BNE);
      expect(d.offset).toBe(-2);
    });

    it('assembles BEQ with label (forward reference)', () => {
      const src = `
        BEQ r1, r2, target
        NOP
        NOP
target:
        HALT
`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      // BEQ at addr 0, target at addr 3, offset = 3
      const d = decodeB(result.words[0]);
      expect(d.opcode).toBe(OP_BEQ);
      expect(d.offset).toBe(3);
    });

    it('rejects short branch out of range', () => {
      // Target 10 instructions away — too far
      const lines = ['BEQ r1, r2, target'];
      for (let i = 0; i < 10; i++) lines.push('NOP');
      lines.push('target:');
      lines.push('HALT');
      const result = assemble(lines.join('\n'));
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('out of range');
    });
  });

  describe('Format W instructions (2-word)', () => {
    it('assembles LI rd, imm16', () => {
      const result = assemble('LI r1, 0x1234');
      expect(result.errors).toEqual([]);
      expect(result.words).toHaveLength(2);
      const opcode = (result.words[0] >> 10) & 0x3F;
      const rd = (result.words[0] >> 7) & 0x7;
      expect(opcode).toBe(OP_LI);
      expect(rd).toBe(1);
      expect(result.words[1]).toBe(0x1234);
    });

    it('assembles JMP label', () => {
      const src = `
        JMP end
        NOP
end:
        HALT
`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      // JMP is 2 words at addr 0,1; NOP at addr 2; end label at addr 3
      const opcode = (result.words[0] >> 10) & 0x3F;
      expect(opcode).toBe(OP_JMP);
      expect(result.words[1]).toBe(3); // target address
    });
  });

  describe('Format BL instructions (long branch)', () => {
    it('assembles BEQL rs1, rs2, label', () => {
      const src = `
start:
        BEQL r1, r2, start
`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect(result.words).toHaveLength(2);
      const opcode = (result.words[0] >> 10) & 0x3F;
      const rs1 = (result.words[0] >> 7) & 0x7;
      const rs2 = (result.words[0] >> 4) & 0x7;
      expect(opcode).toBe(OP_BEQL);
      expect(rs1).toBe(1);
      expect(rs2).toBe(2);
      expect(result.words[1]).toBe(0); // target = start = addr 0
    });
  });

  describe('HALT', () => {
    it('assembles HALT', () => {
      const result = assemble('HALT');
      expect(result.errors).toEqual([]);
      expect(result.words).toHaveLength(1);
      expect((result.words[0] >> 10) & 0x3F).toBe(OP_HALT);
    });
  });

  describe('CHECKPOINT', () => {
    it('assembles CHECKPOINT', () => {
      const result = assemble('CHECKPOINT');
      expect(result.errors).toEqual([]);
      expect(result.words).toHaveLength(1);
      expect((result.words[0] >> 10) & 0x3F).toBe(OP_CHECKPOINT);
      // CHECKPOINT uses a magic operand pattern (0x2A5) to resist
      // accidental triggering from corrupted memory
      expect(result.words[0] & 0x3FF).toBe(0x2A5);
    });
  });

  describe('aliases', () => {
    it('expands NOP to ADD r0, r0, r0', () => {
      const result = assemble('NOP');
      expect(result.errors).toEqual([]);
      const d = decodeR(result.words[0]);
      expect(d.opcode).toBe(OP_ADD);
      expect(d.rd).toBe(0);
      expect(d.rs1).toBe(0);
      expect(d.rs2).toBe(0);
    });

    it('expands MOV rd, rs to ADD rd, rs, r0', () => {
      const result = assemble('MOV r1, r2');
      expect(result.errors).toEqual([]);
      const d = decodeR(result.words[0]);
      expect(d.opcode).toBe(OP_ADD);
      expect(d.rd).toBe(1);
      expect(d.rs1).toBe(2);
      expect(d.rs2).toBe(0);
    });

    it('expands RET to JALR r0, r6', () => {
      const result = assemble('RET');
      expect(result.errors).toEqual([]);
      const d = decodeR(result.words[0]);
      expect(d.opcode).toBe(OP_JALR);
      expect(d.rd).toBe(0);
      expect(d.rs1).toBe(6);
    });

    it('expands CALL rs to JALR r6, rs', () => {
      const result = assemble('CALL r3');
      expect(result.errors).toEqual([]);
      const d = decodeR(result.words[0]);
      expect(d.opcode).toBe(OP_JALR);
      expect(d.rd).toBe(6);
      expect(d.rs1).toBe(3);
    });

    it('expands LA rd, label to LI rd, address', () => {
      const src = `
        LA r1, data
data:
        .word 0x42
`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      // LA -> LI (2 words) at addr 0,1. data at addr 2.
      const opcode = (result.words[0] >> 10) & 0x3F;
      expect(opcode).toBe(OP_LI);
      expect(result.words[1]).toBe(2);
    });
  });

  describe('register aliases', () => {
    it('accepts zero as r0', () => {
      const result = assemble('ADD r1, zero, r2');
      expect(result.errors).toEqual([]);
      const d = decodeR(result.words[0]);
      expect(d.rs1).toBe(0);
    });

    it('accepts sp as r7', () => {
      const result = assemble('MOV sp, r1');
      expect(result.errors).toEqual([]);
      const d = decodeR(result.words[0]);
      expect(d.rd).toBe(7);
    });
  });

  describe('directives', () => {
    it('.word emits data', () => {
      const result = assemble('.word 0x1234, 0x5678');
      expect(result.errors).toEqual([]);
      expect(result.words).toEqual([0x1234, 0x5678]);
    });

    it('.zero emits zeroes', () => {
      const result = assemble('.zero 5');
      expect(result.errors).toEqual([]);
      expect(result.words).toEqual([0, 0, 0, 0, 0]);
    });

    it('.equ defines constants', () => {
      const src = `
.equ BASE, 0x6000
LI r1, BASE
`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect(result.words).toHaveLength(2);
      expect(result.words[1]).toBe(0x6000);
    });

    it('.org sets output address', () => {
      const src = `
        ADD r1, r1, r1
.org 0x0004
        HALT
`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      // ADD r1,r1,r1 at 0, zero-fill 1..3, HALT at 4
      expect(result.words).toHaveLength(5);
      const d0 = decodeR(result.words[0]);
      expect(d0.opcode).toBe(OP_ADD);
      expect(d0.rd).toBe(1);
      expect(result.words[1]).toBe(0);
      expect(result.words[2]).toBe(0);
      expect(result.words[3]).toBe(0);
      expect((result.words[4] >> 10) & 0x3F).toBe(OP_HALT);
    });
  });

  describe('labels', () => {
    it('records label addresses', () => {
      const src = `
start:
        NOP
middle:
        NOP
end:
        HALT
`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect(result.labels.get('start')).toBe(0);
      expect(result.labels.get('middle')).toBe(1);
      expect(result.labels.get('end')).toBe(2);
    });

    it('supports forward references', () => {
      const src = `
        JMP end
        NOP
        NOP
end:
        HALT
`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect(result.words[1]).toBe(4); // JMP target = addr of end
    });

    it('detects duplicate labels', () => {
      const src = `
dup:
        NOP
dup:
        HALT
`;
      const result = assemble(src);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('duplicate');
    });

    it('detects undefined labels', () => {
      const result = assemble('JMP nowhere');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('undefined');
    });
  });

  describe('numeric literals', () => {
    it('parses hex', () => {
      const result = assemble('.word 0xFF');
      expect(result.errors).toEqual([]);
      expect(result.words).toEqual([0xFF]);
    });

    it('parses binary', () => {
      const result = assemble('.word 0b1010');
      expect(result.errors).toEqual([]);
      expect(result.words).toEqual([10]);
    });

    it('parses decimal', () => {
      const result = assemble('.word 42');
      expect(result.errors).toEqual([]);
      expect(result.words).toEqual([42]);
    });
  });

  describe('comments and whitespace', () => {
    it('ignores comments', () => {
      const src = `
; This is a full-line comment
        NOP ; inline comment
        HALT
`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect(result.words).toHaveLength(2);
    });

    it('ignores blank lines', () => {
      const src = `

        NOP

        HALT

`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect(result.words).toHaveLength(2);
    });
  });

  describe('error reporting', () => {
    it('reports invalid register names', () => {
      const result = assemble('ADD r1, r8, r3');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('invalid register');
    });

    it('reports unknown instructions', () => {
      const result = assemble('BADOP r1, r2');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('unknown instruction');
    });
  });

  describe('integration: small program', () => {
    it('assembles a simple loop program', () => {
      const src = `
; Count from 0 to 10
        LI r1, 0       ; counter
        LI r2, 10      ; limit
loop:
        ADDI r1, r1, 1
        BLT r1, r2, loop
        HALT
`;
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      // LI r1,0 (2 words) + LI r2,10 (2 words) + ADDI (1) + BLT (1) + HALT (1) = 7
      expect(result.words).toHaveLength(7);
      expect(result.labels.get('loop')).toBe(4);

      // Verify the BLT branch offset: loop is at addr 4, BLT is at addr 5
      // offset = 4 - 5 = -1
      const bltWord = result.words[5];
      const d = decodeB(bltWord);
      expect(d.opcode).toBe(OP_BLT);
      expect(d.offset).toBe(-1);
    });
  });
});
