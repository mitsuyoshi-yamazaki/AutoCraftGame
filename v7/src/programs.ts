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
 */
export function generateReplicatorProgram(recipe: number): number[] {
  const code: number[] = [];
  let pc = 0;

  function emit1(word: number) { code.push(word); pc++; }
  function emit2(words: readonly [number, number]) { code.push(words[0], words[1]); pc += 2; }
  function li(rd: number, imm: number) { emit2(encodeW(Opcode.LI, rd, 0, imm)); }
  function out(valReg: number) { emit1(encodeR(Opcode.OUT, 0, 2, valReg)); }
  function inr(dest: number) { emit1(encodeR(Opcode.IN, dest, 2, 0)); }

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
  emit2(encodeBL(Opcode.BNEL, 6, 0, 0));  // if busy, skip to next

  // Configure assembler
  li(2, OPMEM_TID); out(3);               // TARGET_ID = r3
  li(1, 2); li(2, OPMEM_OFF); out(1);     // OFFSET = 2 (recipe)
  li(1, recipe); li(2, OPMEM_VAL); out(1); // VALUE = recipe
  li(1, 1); li(2, OPMEM_OFF); out(1);     // OFFSET = 1 (trigger)
  li(2, OPMEM_VAL); out(1);               // VALUE = 1

  const jmp_p2_pc = pc;
  emit2(encodeBL(Opcode.BEQL, 0, 0, 0));  // unconditional jump to Phase 2 (r0==r0)

  // asm_next: increment index, loop
  const asm_next_pc = pc;
  code[bne_asm_next_pc + 1] = asm_next_pc;

  emit1(encodeI(Opcode.ADDI, 4, 4, 1));   // r4++
  emit2(encodeBL(Opcode.BLTL, 4, 5, asm_loop_start)); // if r4 < count, loop

  // ============================================
  // Phase 2: Find ONE stopped Processor, copy memory + start
  // ============================================
  const phase2_pc = pc;
  code[beql_p2_pc + 1] = phase2_pc;
  code[jmp_p2_pc + 1] = phase2_pc;

  // SCAN for Processors (filter=2)
  li(1, 2); li(2, SCAN_FILTER); out(1);
  li(1, 1); li(2, SCAN_TRIGGER); out(1);

  li(2, SCAN_COUNT); inr(5);              // r5 = count

  const beql_halt_pc = pc;
  emit2(encodeBL(Opcode.BEQL, 5, 0, 0)); // if count==0, skip to HALT

  // Loop over results to find stopped processor (run_flag == 0)
  li(4, 0);                                // r4 = index

  const proc_loop_start = pc;
  li(1, 4);
  emit1(encodeR(Opcode.MUL, 6, 4, 1));    // r6 = r4 * 4
  li(1, SCAN_BASE);
  emit1(encodeR(Opcode.ADD, 2, 6, 1));
  inr(3);                                  // r3 = localId

  emit1(encodeI(Opcode.ADDI, 2, 2, 3));
  inr(6);                                  // r6 = aux (run_flag)

  // If running (r6 != 0), skip to next
  const bne_proc_next_pc = pc;
  emit2(encodeBL(Opcode.BNEL, 6, 0, 0));

  // Found stopped processor — copy self memory
  li(2, PMEM_TID); out(3);                // PMEM_TARGET_ID = r3
  li(1, 0); li(2, PMEM_ADDR); out(1);     // PMEM_ADDR = 0

  li(6, 0);                                // r6 = src addr (counter)
  li(2, PMEM_AUTOVAL);                     // r2 = PMEM_AUTO_VALUE addr (constant)
  li(5, 1024);                             // r5 = 1024 (loop limit, reuse r5)

  const copy_loop_pc = pc;
  emit1(encodeR(Opcode.LW, 1, 6, 0));     // r1 = self.mem[r6]
  out(1);                                  // write r1 + auto-inc addr
  emit1(encodeI(Opcode.ADDI, 6, 6, 1));   // r6++
  emit2(encodeBL(Opcode.BLTL, 6, 5, copy_loop_pc)); // if r6 < 1024, loop
  // Loop body: 1 + 1 + 1 + 2 = 5 instructions. 1024 * 3 ops = ~3072 instructions

  // Start processor: write run_flag=1
  li(2, OPMEM_TID); out(3);               // TARGET_ID = r3
  li(1, 2); li(2, OPMEM_OFF); out(1);     // OFFSET = 2 (run_flag)
  li(1, 1); li(2, OPMEM_VAL); out(1);     // VALUE = 1

  const jmp_halt_pc = pc;
  emit2(encodeBL(Opcode.BEQL, 0, 0, 0));  // jump to HALT

  // proc_next: increment, loop
  const proc_next_pc = pc;
  code[bne_proc_next_pc + 1] = proc_next_pc;

  emit1(encodeI(Opcode.ADDI, 4, 4, 1));
  emit2(encodeBL(Opcode.BLTL, 4, 5, proc_loop_start));

  // HALT
  const halt_pc = pc;
  code[beql_halt_pc + 1] = halt_pc;
  code[jmp_halt_pc + 1] = halt_pc;
  emit1(encodeR(Opcode.HALT, 0, 0, 0));

  return code;
}
