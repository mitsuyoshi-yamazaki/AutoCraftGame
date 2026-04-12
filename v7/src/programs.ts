/**
 * v7 Processor programs — hand-assembled for self-replication.
 */

import { Opcode, encodeR, encodeW, encodeI, encodeBL } from './vm/vm.js';

const SCAN_FILTER  = 0x0103;
const SCAN_TRIGGER = 0x0101;
const SCAN_COUNT   = 0x0104;
const SCAN_BASE    = 0x0105;  // result[0] starts here, 4 words per entry
const OPMEM_TID    = 0x1000;
const OPMEM_OFF    = 0x1001;
const OPMEM_VAL    = 0x1002;
const PMEM_TID     = 0x2000;
const PMEM_ADDR    = 0x2001;
const PMEM_AUTOVAL = 0x2003;

/**
 * Generate replicator program.
 * @param recipe - 3 (Assembler) for program c, 4 (Processor) for program d
 * @param options.copySize - number of words to copy (default: 1024 = full memory)
 * @param options.targetRunning - if true, target ANY Processor (not just stopped ones)
 */
export function generateReplicatorProgram(
  recipe: number,
  options: { copySize?: number; targetRunning?: boolean } = {},
): number[] {
  const copySize = options.copySize ?? 1024;
  const targetRunning = options.targetRunning ?? false;
  const code: number[] = [];
  let pc = 0;

  function emit1(word: number) { code.push(word); pc++; }
  function emit2(words: readonly [number, number]) { code.push(words[0], words[1]); pc += 2; }
  function li(rd: number, imm: number) { emit2(encodeW(Opcode.LI, rd, 0, imm)); }
  function out(valReg: number) { emit1(encodeR(Opcode.OUT, 0, 2, valReg)); }
  function inr(dest: number) { emit1(encodeR(Opcode.IN, dest, 2, 0)); }
  // Emit a long branch with a backward target (PC-relative offset computed from current pc).
  function emitBLBack(opcode: number, rs1: number, rs2: number, targetPc: number) {
    emit2(encodeBL(opcode, rs1, rs2, (targetPc - pc) & 0xFFFF));
  }
  // Patch a forward branch: word at branchPc+1 holds PC-relative offset to targetPc.
  function patchBL(branchPc: number, targetPc: number) {
    code[branchPc + 1] = (targetPc - branchPc) & 0xFFFF;
  }

  // ============================================
  // Phase 1: Find ONE idle Assembler, configure it
  // ============================================
  // SCAN for Assemblers (filter=1)
  li(1, 1); li(2, SCAN_FILTER); out(1);
  li(1, 1); li(2, SCAN_TRIGGER); out(1);

  li(2, SCAN_COUNT); inr(5);              // r5 = count

  const beql_p2_pc = pc;
  emit2(encodeBL(Opcode.BEQL, 5, 0, 0)); // if count==0, skip to Phase 2

  // Loop over results to find idle assembler (current_action == 0)
  li(4, 0);                                // r4 = index

  const asm_loop_start = pc;
  // Compute scan result address: SCAN_BASE + r4*4
  li(1, 4);
  emit1(encodeR(Opcode.MUL, 6, 4, 1));    // r6 = r4 * 4
  li(1, SCAN_BASE);
  emit1(encodeR(Opcode.ADD, 2, 6, 1));    // r2 = SCAN_BASE + r4*4 (id addr)
  inr(3);                                  // r3 = localId

  // Read aux (offset +3)
  emit1(encodeI(Opcode.ADDI, 2, 2, 3));   // r2 += 3
  inr(6);                                  // r6 = aux (current_action)

  // If idle (r6 == 0), configure it
  const bne_asm_next_pc = pc;
  emit2(encodeBL(Opcode.BNEL, 6, 0, 0));  // if busy, skip to next (patched below)

  // Configure assembler
  li(2, OPMEM_TID); out(3);               // TARGET_ID = r3
  li(1, 2); li(2, OPMEM_OFF); out(1);     // OFFSET = 2 (recipe)
  li(1, recipe); li(2, OPMEM_VAL); out(1); // VALUE = recipe
  li(1, 1); li(2, OPMEM_OFF); out(1);     // OFFSET = 1 (trigger)
  li(2, OPMEM_VAL); out(1);               // VALUE = 1

  const jmp_p2_pc = pc;
  emit2(encodeBL(Opcode.BEQL, 0, 0, 0));  // unconditional jump to Phase 2 (patched below)

  // asm_next: increment index, loop
  const asm_next_pc = pc;
  patchBL(bne_asm_next_pc, asm_next_pc);

  emit1(encodeI(Opcode.ADDI, 4, 4, 1));   // r4++
  emitBLBack(Opcode.BLTL, 4, 5, asm_loop_start); // if r4 < count, loop

  // ============================================
  // Phase 2: Find ONE stopped Processor, copy memory + start
  // ============================================
  const phase2_pc = pc;
  patchBL(beql_p2_pc, phase2_pc);
  patchBL(jmp_p2_pc, phase2_pc);

  // SCAN for Processors (filter=2)
  li(1, 2); li(2, SCAN_FILTER); out(1);
  li(1, 1); li(2, SCAN_TRIGGER); out(1);

  li(2, SCAN_COUNT); inr(5);              // r5 = count

  const beql_halt_pc = pc;
  emit2(encodeBL(Opcode.BEQL, 5, 0, 0)); // if count==0, skip to HALT

  // Loop over results to find target processor
  li(4, 0);                                // r4 = index

  const proc_loop_start = pc;
  li(1, 4);
  emit1(encodeR(Opcode.MUL, 6, 4, 1));    // r6 = r4 * 4
  li(1, SCAN_BASE);
  emit1(encodeR(Opcode.ADD, 2, 6, 1));
  inr(3);                                  // r3 = localId

  emit1(encodeI(Opcode.ADDI, 2, 2, 3));
  inr(6);                                  // r6 = aux (run_flag)

  // Filter: skip running processors (unless targetRunning is set)
  const bne_proc_next_pc = pc;
  if (!targetRunning) {
    emit2(encodeBL(Opcode.BNEL, 6, 0, 0));  // If running (r6 != 0), skip to next
  } else {
    emit2(encodeBL(Opcode.BNEL, 0, 0, 0));  // Never taken (r0 != r0 is false) — accept any target
  }

  // Found stopped processor — copy self memory
  li(2, PMEM_TID); out(3);                // PMEM_TARGET_ID = r3
  li(1, 0); li(2, PMEM_ADDR); out(1);     // PMEM_ADDR = 0

  li(6, 0);                                // r6 = src addr (counter)
  li(2, PMEM_AUTOVAL);                     // r2 = PMEM_AUTO_VALUE addr (constant)
  li(5, copySize);                          // r5 = copySize (loop limit, reuse r5)

  const copy_loop_pc = pc;
  emit1(encodeR(Opcode.LW, 1, 6, 0));     // r1 = self.mem[r6]
  out(1);                                  // write r1 + auto-inc addr
  emit1(encodeI(Opcode.ADDI, 6, 6, 1));   // r6++
  emitBLBack(Opcode.BLTL, 6, 5, copy_loop_pc); // if r6 < copySize, loop

  // Start processor: write run_flag=1
  li(2, OPMEM_TID); out(3);               // TARGET_ID = r3
  li(1, 2); li(2, OPMEM_OFF); out(1);     // OFFSET = 2 (run_flag)
  li(1, 1); li(2, OPMEM_VAL); out(1);     // VALUE = 1

  const jmp_halt_pc = pc;
  emit2(encodeBL(Opcode.BEQL, 0, 0, 0));  // jump to HALT (patched below)

  // proc_next: increment, loop
  const proc_next_pc = pc;
  patchBL(bne_proc_next_pc, proc_next_pc);

  emit1(encodeI(Opcode.ADDI, 4, 4, 1));
  emitBLBack(Opcode.BLTL, 4, 5, proc_loop_start);

  // HALT
  const halt_pc = pc;
  patchBL(beql_halt_pc, halt_pc);
  patchBL(jmp_halt_pc, halt_pc);
  emit1(encodeR(Opcode.HALT, 0, 0, 0));

  return code;
}
