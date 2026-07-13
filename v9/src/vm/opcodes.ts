// Shared opcode definitions for v5 VM
// Both the VM executor and the assembler import from this file.

// Format R opcodes (1-word: [opcode:6][rd:3][rs1:3][rs2:3][x:1])
export const OP_ADD = 0;
export const OP_SUB = 1;
export const OP_MUL = 2;
export const OP_DIV = 3;
export const OP_MOD = 4;
export const OP_AND = 5;
export const OP_OR = 6;
export const OP_XOR = 7;
export const OP_SHL = 8;
export const OP_SHR = 9;
export const OP_IN = 10;
export const OP_OUT = 11;
export const OP_JALR = 12;

// Checkpoint instruction (1-word, no operands, opcode 13)
// When executed: cp = PC + 1, cpSet = true, PC += 1
// At tick start: if cpSet is true, PC is reset to cp
export const OP_CHECKPOINT = 13;

// Format LBL1 opcodes (v7: 1-word [opcode:6][label_id:10])
export const OP_LABEL = 14;
export const OP_JMPL  = 15;

// Format I opcodes (1-word: [opcode:6][rd:3][rs:3][imm4:4])
export const OP_ADDI = 16;
export const OP_LW = 17;
export const OP_SW = 18;
export const OP_PUSH = 19;
export const OP_POP = 20;

// Format LBL2 opcodes (v7: 2-word; word1 [opcode:6][rd_or_rsval:3][rs:3][x:4], word2 [reserved:6][label_id:10])
export const OP_LWL = 21;
export const OP_SWL = 22;

// Format B opcodes (short branch, 1-word: [opcode:6][rs1:3][rs2:3][offset:4])
export const OP_BEQ = 24;
export const OP_BNE = 25;
export const OP_BLT = 26;
export const OP_BGE = 27;

// Format W opcodes (2-word: word1=[opcode:6][rd:3][rs:3][x:4], word2=[imm16:16])
export const OP_LI = 32;
export const OP_JMP = 33;

// Format BL opcodes (long branch, 2-word: word1=[opcode:6][rs1:3][rs2:3][x:4], word2=[target:16])
export const OP_BEQL = 34;
export const OP_BNEL = 35;
export const OP_BLTL = 36;
export const OP_BGEL = 37;

// Special
export const OP_HALT = 63;
