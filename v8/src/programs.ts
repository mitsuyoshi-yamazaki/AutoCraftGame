/**
 * v8 Processor programs — hand-assembled self-replicating program.
 *
 * Flow (single program, used for both parent and descendants):
 *   1. CONNECTION_SCAN filter=1 → parent Assembler localId (r3)
 *   2. Request ASSEMBLE(recipe=4, connection_target=parent A) for child Processor
 *   3. Poll last_product_id (via 0x1005) until child P ready; save as r7
 *   4. Request ASSEMBLE(recipe=3, connection_target=child P) for child Assembler
 *   5. Poll last_product_id until child A ready
 *   6. Copy self memory to child P (via PMEM auto-increment)
 *   7. Start child P (set run_flag=1)
 *   8. DISCONNECT parent A ↔ child P (via parent A's DISCONNECT action)
 *   9. HALT forever
 */

import {
  Opcode,
  encodeR,
  encodeW,
  encodeI,
  encodeBL,
  encodeLabel,
  encodeJmpl,
} from './vm/vm.js';

// I/O addresses
const CSCAN_TRIGGER = 0x0100 + 36;  // 0x0124
const CSCAN_FILTER  = 0x0100 + 37;  // 0x0125
const CSCAN_COUNT   = 0x0100 + 38;  // 0x0126
const CSCAN_RESULT0 = 0x0100 + 39;  // 0x0127 (first result id)

const OPMEM_TID     = 0x1000;
const OPMEM_OFF     = 0x1001;
const OPMEM_VAL     = 0x1002;
const OPMEM_VAL_LID = 0x1005;

const PMEM_TID      = 0x2000;
const PMEM_ADDR     = 0x2001;
const PMEM_AUTO_VAL = 0x2003;

// Assembler opmem offsets
const ASM_TRIG = 0;
const ASM_RECIPE = 1;
const ASM_CONN_TARGET = 2;
const ASM_LAST_PRODUCT = 5;
const ASM_DISC_TRIG = 6;
const ASM_DISC_TARGET = 7;

// Processor opmem offsets
const PROC_RUN_FLAG = 0;

// Labels
const L_WAIT_P = 10;
const L_WAIT_A = 11;
const L_COPY_LOOP = 12;
const L_HALT = 13;

export function generateReplicatorProgram(_options: { copySize?: number; targetRunning?: boolean } = {}): number[] {
  const code: number[] = [];
  let pc = 0;

  const emit1 = (w: number) => { code.push(w); pc++; };
  const emit2 = (ws: readonly [number, number]) => { code.push(ws[0], ws[1]); pc += 2; };
  const li = (rd: number, imm: number) => emit2(encodeW(Opcode.LI, rd, 0, imm));
  const out = (valReg: number) => emit1(encodeR(Opcode.OUT, 0, 2, valReg));
  const inr = (dest: number) => emit1(encodeR(Opcode.IN, dest, 2, 0));
  const halt = () => emit1(encodeR(Opcode.HALT, 0, 0, 0));
  const patchBL = (branchPc: number, targetPc: number) => {
    code[branchPc + 1] = (targetPc - branchPc) & 0xFFFF;
  };

  // Write constant value to target opmem[off] via OPMEM_VAL (sets OFF+VAL)
  const writeOpmem = (off: number, val: number) => {
    li(1, off);  li(2, OPMEM_OFF); out(1);
    li(1, val);  li(2, OPMEM_VAL); out(1);
  };
  // Write register value to target opmem[off] via OPMEM_VAL_LOCAL_ID (conversion)
  const writeOpmemLidReg = (off: number, valReg: number) => {
    li(1, off);  li(2, OPMEM_OFF); out(1);
    li(2, OPMEM_VAL_LID); out(valReg);
  };
  // Read target opmem[off] via OPMEM_VAL_LOCAL_ID into dest
  const readOpmemLid = (off: number, dest: number) => {
    li(1, off);  li(2, OPMEM_OFF); out(1);
    li(2, OPMEM_VAL_LID); inr(dest);
  };

  // ====================
  // Step 1: CSCAN filter=1 → r3 = parent A localId
  // ====================
  li(1, 1); li(2, CSCAN_FILTER); out(1);
  li(1, 1); li(2, CSCAN_TRIGGER); out(1);
  li(2, CSCAN_COUNT); inr(5);               // r5 = count

  // If count == 0, halt forever
  const bne_have_asm = pc;
  emit2(encodeBL(Opcode.BNEL, 5, 0, 0));    // if r5 != 0, skip next
  emit1(encodeJmpl(L_HALT));                // else → halt
  patchBL(bne_have_asm, pc);

  li(2, CSCAN_RESULT0); inr(3);             // r3 = parent A localId

  // ====================
  // Step 2: Request child Processor (recipe=4, target=parent A itself)
  // ====================
  li(2, OPMEM_TID); out(3);                  // target = parent A
  writeOpmem(ASM_RECIPE, 4);
  writeOpmemLidReg(ASM_CONN_TARGET, 3);      // connection_target = r3 (parent A)
  writeOpmem(ASM_TRIG, 1);

  // ====================
  // Step 3: Poll last_product_id until child P ready (into r4), then save r4→r7
  // ====================
  emit1(encodeLabel(L_WAIT_P));
  li(2, OPMEM_TID); out(3);                  // re-assert target = parent A
  readOpmemLid(ASM_LAST_PRODUCT, 4);
  const bne_past_wait_p = pc;
  emit2(encodeBL(Opcode.BNEL, 4, 0, 0));    // if r4 != 0, skip halt
  halt();
  emit1(encodeJmpl(L_WAIT_P));               // resumed next tick here
  patchBL(bne_past_wait_p, pc);

  emit1(encodeR(Opcode.OR, 7, 4, 0));        // r7 = r4

  // ====================
  // Step 4: Request child Assembler (recipe=3, target=child P)
  // ====================
  li(2, OPMEM_TID); out(3);                  // target = parent A
  writeOpmem(ASM_RECIPE, 3);
  writeOpmemLidReg(ASM_CONN_TARGET, 7);      // connection_target = r7 (child P)
  writeOpmem(ASM_TRIG, 1);

  // ====================
  // Step 5: Poll last_product_id until child A ready
  // ====================
  emit1(encodeLabel(L_WAIT_A));
  li(2, OPMEM_TID); out(3);
  readOpmemLid(ASM_LAST_PRODUCT, 4);
  const bne_past_wait_a = pc;
  emit2(encodeBL(Opcode.BNEL, 4, 0, 0));
  halt();
  emit1(encodeJmpl(L_WAIT_A));
  patchBL(bne_past_wait_a, pc);

  // ====================
  // Step 6: Copy self memory → child P
  // ====================
  li(2, PMEM_TID); out(7);                   // PMEM_TID = r7 (child P)
  li(1, 0); li(2, PMEM_ADDR); out(1);        // PMEM_ADDR = 0
  li(6, 0);                                   // r6 = src counter
  li(5, 1024);                                // r5 = copy limit
  li(2, PMEM_AUTO_VAL);                       // r2 = PMEM_AUTO_VAL addr (constant for copy loop)

  emit1(encodeLabel(L_COPY_LOOP));
  emit1(encodeR(Opcode.LW, 1, 6, 0));        // r1 = mem[r6]
  out(1);                                     // PMEM_AUTO_VAL = r1
  emit1(encodeI(Opcode.ADDI, 6, 6, 1));      // r6++
  // If r6 >= r5, fall through; else jump to L_COPY_LOOP
  const bge_copy_exit = pc;
  emit2(encodeBL(Opcode.BGEL, 6, 5, 0));     // if r6 >= 1024, exit
  emit1(encodeJmpl(L_COPY_LOOP));             // else loop
  patchBL(bge_copy_exit, pc);

  // ====================
  // Step 7: Start child P (run_flag = 1)
  // ====================
  li(2, OPMEM_TID); out(7);                  // target = child P
  writeOpmem(PROC_RUN_FLAG, 1);

  // ====================
  // Step 8: Disconnect parent A ↔ child P
  // ====================
  li(2, OPMEM_TID); out(3);                  // target = parent A
  writeOpmemLidReg(ASM_DISC_TARGET, 7);
  writeOpmem(ASM_DISC_TRIG, 1);

  // ====================
  // Step 9: HALT forever
  // ====================
  emit1(encodeLabel(L_HALT));
  halt();
  emit1(encodeJmpl(L_HALT));

  return code;
}
