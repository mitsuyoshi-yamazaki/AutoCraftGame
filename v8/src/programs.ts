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

const SCAN_TRIGGER = 0x0100 + 1;    // 0x0101
const SCAN_FILTER  = 0x0100 + 2;    // 0x0102
const SCAN_COUNT   = 0x0100 + 3;    // 0x0103
const SCAN_RESULT0 = 0x0100 + 4;    // 0x0104 (first result id)

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

/**
 * Fixed replicator (v2). Same flow as generateReplicatorProgram, but:
 * - Between step 4 (trigger recipe 3) and step 5 (poll last_product_id),
 *   explicitly clear the Assembler's `last_product_id` slot. This avoids
 *   the stale-read bug where parent P sees the previous cycle's child P
 *   productId and exits the wait loop instantly, causing step 8's
 *   DISCONNECT to fire before child A is born (child P ends up freestanding).
 * - Supports optional `copySize` parameter (defaults to 1024).
 * - Supports `loop` option: after step 8 the program jumps back to step 1
 *   instead of halting forever, enabling the *parent* processor to run
 *   additional replication cycles.
 */
export function generateReplicatorProgramV2(options: {
  copySize?: number;
  loop?: boolean;
} = {}): number[] {
  const copySize = options.copySize ?? 1024;
  const loop = options.loop ?? false;

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

  const writeOpmem = (off: number, val: number) => {
    li(1, off);  li(2, OPMEM_OFF); out(1);
    li(1, val);  li(2, OPMEM_VAL); out(1);
  };
  const writeOpmemLidReg = (off: number, valReg: number) => {
    li(1, off);  li(2, OPMEM_OFF); out(1);
    li(2, OPMEM_VAL_LID); out(valReg);
  };
  const readOpmemLid = (off: number, dest: number) => {
    li(1, off);  li(2, OPMEM_OFF); out(1);
    li(2, OPMEM_VAL_LID); inr(dest);
  };

  // Fresh labels (v2 keeps its own set so both programs can coexist).
  const L2_START    = 20;
  const L2_WAIT_P   = 21;
  const L2_WAIT_A   = 22;
  const L2_COPY     = 23;
  const L2_HALT     = 24;

  emit1(encodeLabel(L2_START));

  // Step 1: CSCAN filter=1 → r3
  li(1, 1); li(2, CSCAN_FILTER); out(1);
  li(1, 1); li(2, CSCAN_TRIGGER); out(1);
  li(2, CSCAN_COUNT); inr(5);
  const bne_have = pc;
  emit2(encodeBL(Opcode.BNEL, 5, 0, 0));
  emit1(encodeJmpl(L2_HALT));
  patchBL(bne_have, pc);
  li(2, CSCAN_RESULT0); inr(3);

  // Step 2: assemble recipe=4 on parent A
  li(2, OPMEM_TID); out(3);
  writeOpmem(ASM_RECIPE, 4);
  writeOpmemLidReg(ASM_CONN_TARGET, 3);
  writeOpmem(ASM_TRIG, 1);

  // Step 3: wait for child P
  emit1(encodeLabel(L2_WAIT_P));
  li(2, OPMEM_TID); out(3);
  readOpmemLid(ASM_LAST_PRODUCT, 4);
  const bne_wp = pc;
  emit2(encodeBL(Opcode.BNEL, 4, 0, 0));
  halt();
  emit1(encodeJmpl(L2_WAIT_P));
  patchBL(bne_wp, pc);
  emit1(encodeR(Opcode.OR, 7, 4, 0));  // r7 = r4 = child P

  // Step 4: assemble recipe=3 on parent A.
  //
  // *** Fix for the stale last_product_id bug: ***
  // After writing assemble_trigger=1 the write sits in pendingWrites and is
  // only committed at end of the processor's tick. Parent A's opmem in
  // state.world still carries `last_product_id = <child P id>` from the
  // previous cycle, so if we poll immediately the read returns nonzero and
  // the wait loop exits on its first iteration. We therefore HALT right
  // after writing the trigger — that yields the tick and lets the Component
  // action phase fire, at which point parent A consumes the trigger (which
  // clears last_product_id to 0 and enters gathering). The next tick's
  // poll then correctly waits for the new product to be built.
  li(2, OPMEM_TID); out(3);
  writeOpmem(ASM_LAST_PRODUCT, 0);       // paranoia: also force clear via write
  writeOpmem(ASM_RECIPE, 3);
  writeOpmemLidReg(ASM_CONN_TARGET, 7);
  writeOpmem(ASM_TRIG, 1);
  halt();                                 // yield — crucial to avoid stale read

  // Step 5: wait for child A
  emit1(encodeLabel(L2_WAIT_A));
  li(2, OPMEM_TID); out(3);
  readOpmemLid(ASM_LAST_PRODUCT, 4);
  const bne_wa = pc;
  emit2(encodeBL(Opcode.BNEL, 4, 0, 0));
  halt();
  emit1(encodeJmpl(L2_WAIT_A));
  patchBL(bne_wa, pc);

  // Step 6: copy memory → child P
  li(2, PMEM_TID); out(7);
  li(1, 0); li(2, PMEM_ADDR); out(1);
  li(6, 0);
  li(5, copySize);
  li(2, PMEM_AUTO_VAL);

  emit1(encodeLabel(L2_COPY));
  emit1(encodeR(Opcode.LW, 1, 6, 0));
  out(1);
  emit1(encodeI(Opcode.ADDI, 6, 6, 1));
  const bge_copy = pc;
  emit2(encodeBL(Opcode.BGEL, 6, 5, 0));
  emit1(encodeJmpl(L2_COPY));
  patchBL(bge_copy, pc);

  // Step 7: start child P
  li(2, OPMEM_TID); out(7);
  writeOpmem(PROC_RUN_FLAG, 1);

  // Step 8: disconnect parent A ↔ child P via parent A
  li(2, OPMEM_TID); out(3);
  writeOpmemLidReg(ASM_DISC_TARGET, 7);
  writeOpmem(ASM_DISC_TRIG, 1);

  // Step 9: halt or loop
  if (loop) {
    emit1(encodeJmpl(L2_START));
  }
  emit1(encodeLabel(L2_HALT));
  halt();
  emit1(encodeJmpl(L2_HALT));

  return code;
}

/**
 * Hijacker program — a standalone Processor that does NOT self-replicate.
 *
 * Behavior:
 *   1. Initial cooldown of `initialCooldown` ticks (let surroundings settle).
 *   2. Main loop:
 *      a. SCAN with filter=2 (Processor only) within proximity range.
 *      b. If no target found, HALT one tick and re-scan.
 *      c. Take first scan result (closest) as target.
 *      d. Compute the largest contiguous zero region in own memory (linear,
 *         non-cyclic). The "main program" is assumed to be `memory minus
 *         that zero region`.
 *      e. Copy the non-zero region to target via PMEM, starting at addr 0,
 *         using the auto-increment write port (PMEM_AUTO_VAL).
 *      f. Cooldown for `postHijackCooldown` ticks.
 *      g. Loop back to (a).
 *
 * Notes:
 *   - The hijacker does not stop the target nor reset its PC. The target
 *     keeps running while being overwritten — this is the intended source
 *     of mutation.
 *   - The largest-zero-region heuristic is recomputed each cycle, so a
 *     hijacker corrupted by being hijacked back will spread its corrupted
 *     memory next time.
 *   - All registers and labels are kept disjoint from the v2 replicator
 *     program so the two can coexist in the same source file without
 *     conflicting label IDs.
 */
export function generateHijackerProgram(options: {
  initialCooldown?: number;
  postHijackCooldown?: number;
} = {}): number[] {
  const initialCooldown = options.initialCooldown ?? 100;
  const postHijackCooldown = options.postHijackCooldown ?? 50;

  const code: number[] = [];
  let pc = 0;
  const emit1 = (w: number) => { code.push(w); pc++; };
  const emit2 = (ws: readonly [number, number]) => { code.push(ws[0], ws[1]); pc += 2; };
  const li = (rd: number, imm: number) => emit2(encodeW(Opcode.LI, rd, 0, imm));
  const out = (valReg: number) => emit1(encodeR(Opcode.OUT, 0, 2, valReg));
  const inr = (dest: number) => emit1(encodeR(Opcode.IN, dest, 2, 0));
  const halt = () => emit1(encodeR(Opcode.HALT, 0, 0, 0));
  const zero = (rd: number) => emit1(encodeI(Opcode.ADDI, rd, 0, 0));
  const patchBL = (branchPc: number, targetPc: number) => {
    code[branchPc + 1] = (targetPc - branchPc) & 0xFFFF;
  };

  // "if rs != 0, jump to label" via BEQL-skip-JMPL pattern
  const branchIfNZJmpl = (rs: number, labelId: number) => {
    emit2(encodeBL(Opcode.BEQL, rs, 0, 3));  // if rs == 0, skip JMPL
    emit1(encodeJmpl(labelId));
  };
  // "if rs == 0, jump to label" via BNEL-skip-JMPL pattern
  const branchIfZJmpl = (rs: number, labelId: number) => {
    emit2(encodeBL(Opcode.BNEL, rs, 0, 3));  // if rs != 0, skip JMPL
    emit1(encodeJmpl(labelId));
  };

  // Hijacker uses label IDs in the 100s to avoid colliding with v1/v2 programs.
  const L_INIT_COOL  = 100;
  const L_MAIN       = 101;
  const L_HAVE_TARGET= 102;
  const L_ZSCAN      = 103;
  const L_ZSCAN_ZERO = 104;
  const L_ZSCAN_NEXT = 105;
  const L_COPY_PRE   = 106;
  const L_COPY_POST  = 107;
  const L_POST_COOL  = 108;

  const MEM_SIZE = 1024;

  // ====================
  // Step 0: Initial cooldown — let surrounding world settle before any hijack.
  // ====================
  li(1, initialCooldown);
  emit1(encodeLabel(L_INIT_COOL));
  halt();
  emit1(encodeI(Opcode.ADDI, 1, 1, -1));   // r1 -= 1
  branchIfNZJmpl(1, L_INIT_COOL);          // if r1 != 0, loop

  // ====================
  // Step 1: Main loop — SCAN for nearby external Processors
  // ====================
  emit1(encodeLabel(L_MAIN));
  li(1, 2); li(2, SCAN_FILTER); out(1);    // filter = 2 (Processor only)
  li(1, 1); li(2, SCAN_TRIGGER); out(1);   // trigger SCAN (immediate)
  li(2, SCAN_COUNT); inr(3);               // r3 = count

  branchIfNZJmpl(3, L_HAVE_TARGET);        // if count != 0 → have_target
  halt();                                  // yield 1 tick, then re-scan
  emit1(encodeJmpl(L_MAIN));

  emit1(encodeLabel(L_HAVE_TARGET));
  li(2, SCAN_RESULT0); inr(3);             // r3 = target localId (closest)

  // ====================
  // Step 4: Compute largest contiguous zero run in own memory[0..1024)
  //   r4 = best_start, r5 = best_len
  //   r6 = i,          r7 = cur_len
  //   r1 = scratch (loaded value / limit)
  //   r3 must be preserved (target localId)
  // ====================
  zero(4); zero(5); zero(6); zero(7);

  emit1(encodeLabel(L_ZSCAN));
  li(1, MEM_SIZE);
  const branch_zscan_end = pc;
  emit2(encodeBL(Opcode.BGEL, 6, 1, 0));   // if i >= MEM_SIZE → end
  emit1(encodeI(Opcode.LW, 1, 6, 0));      // r1 = mem[i]
  branchIfZJmpl(1, L_ZSCAN_ZERO);          // if mem[i] == 0 → extend run

  // nonzero: close current run if cur_len > best_len, then reset cur_len
  {
    const skip_update = pc;
    emit2(encodeBL(Opcode.BGEL, 5, 7, 0)); // if best_len >= cur_len → skip
    emit1(encodeR(Opcode.SUB, 4, 6, 7));   // best_start = i - cur_len
    emit1(encodeR(Opcode.OR,  5, 7, 0));   // best_len  = cur_len
    patchBL(skip_update, pc);
  }
  zero(7);                                 // cur_len = 0
  emit1(encodeJmpl(L_ZSCAN_NEXT));

  emit1(encodeLabel(L_ZSCAN_ZERO));
  emit1(encodeI(Opcode.ADDI, 7, 7, 1));    // cur_len += 1

  emit1(encodeLabel(L_ZSCAN_NEXT));
  emit1(encodeI(Opcode.ADDI, 6, 6, 1));    // i += 1
  emit1(encodeJmpl(L_ZSCAN));

  patchBL(branch_zscan_end, pc);
  // End: close out final run (if memory ends with zeros, the trailing zero
  // run is the typical "rest of memory" region we want to skip).
  {
    const skip_final = pc;
    emit2(encodeBL(Opcode.BGEL, 5, 7, 0)); // if best_len >= cur_len → skip
    emit1(encodeR(Opcode.SUB, 4, 6, 7));
    emit1(encodeR(Opcode.OR,  5, 7, 0));
    patchBL(skip_final, pc);
  }

  // ====================
  // Step 5: Copy own memory to target, skipping [best_start, best_start+best_len)
  //         Start writing at target addr 0 (concatenate the two halves).
  // ====================
  li(2, PMEM_TID); out(3);                  // PMEM_TID = target (last use of r3)
  li(1, 0); li(2, PMEM_ADDR); out(1);       // PMEM_ADDR = 0
  emit1(encodeR(Opcode.ADD, 3, 4, 5));      // r3 = end_of_zero = best_start + best_len
  li(2, PMEM_AUTO_VAL);                      // r2 = 0x2003 (fixed for copy loop)
  zero(6);                                   // i = 0

  // Pre-copy: while i < best_start: write mem[i]; i++
  emit1(encodeLabel(L_COPY_PRE));
  const branch_pre_end = pc;
  emit2(encodeBL(Opcode.BGEL, 6, 4, 0));    // if i >= best_start → end pre
  emit1(encodeI(Opcode.LW, 1, 6, 0));
  out(1);
  emit1(encodeI(Opcode.ADDI, 6, 6, 1));
  emit1(encodeJmpl(L_COPY_PRE));
  patchBL(branch_pre_end, pc);

  // Skip the zero region: i = end_of_zero
  emit1(encodeR(Opcode.OR, 6, 3, 0));       // i = r3

  // Post-copy: while i < MEM_SIZE: write mem[i]; i++
  li(5, MEM_SIZE);                           // limit (best_len no longer needed)
  emit1(encodeLabel(L_COPY_POST));
  const branch_post_end = pc;
  emit2(encodeBL(Opcode.BGEL, 6, 5, 0));
  emit1(encodeI(Opcode.LW, 1, 6, 0));
  out(1);
  emit1(encodeI(Opcode.ADDI, 6, 6, 1));
  emit1(encodeJmpl(L_COPY_POST));
  patchBL(branch_post_end, pc);

  // ====================
  // Step 6: Post-hijack cooldown
  // ====================
  li(1, postHijackCooldown);
  emit1(encodeLabel(L_POST_COOL));
  halt();
  emit1(encodeI(Opcode.ADDI, 1, 1, -1));
  branchIfNZJmpl(1, L_POST_COOL);

  emit1(encodeJmpl(L_MAIN));

  return code;
}
