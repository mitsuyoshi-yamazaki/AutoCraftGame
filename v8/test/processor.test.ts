import { describe, it, expect } from 'vitest';
import { createProcessor, executeProcessorTick, PROCESSOR_OPMEM_SIZE } from '../src/processor.js';
import { createAssembler } from '../src/assembler.js';
import { createEmptyWorld, addObject, getObject } from '../src/world.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { ProcessorObject, AssemblerObject, World } from '../src/types.js';
import {
  PROC_OFF_RUN_FLAG,
  PROC_OFF_SCAN_TRIGGER,
  PROC_OFF_SCAN_FILTER,
  PROC_OFF_SCAN_COUNT,
  PROC_OFF_SCAN_RESULTS,
} from '../src/types.js';
import {
  Opcode, encodeR, encodeW, encodeI,
  encodeLabel, encodeJmpl, encodeLwl, encodeSwl,
} from '../src/vm/vm.js';

// I/O addresses for self opmem (0x0100 + offset)
const IO_RUN_FLAG      = 0x0100 + PROC_OFF_RUN_FLAG;      // 0x0100
const IO_SCAN_TRIGGER  = 0x0100 + PROC_OFF_SCAN_TRIGGER;  // 0x0101
const IO_SCAN_FILTER   = 0x0100 + PROC_OFF_SCAN_FILTER;   // 0x0102
const IO_SCAN_COUNT    = 0x0100 + PROC_OFF_SCAN_COUNT;    // 0x0103
const IO_SCAN_FIRST_ID = 0x0100 + PROC_OFF_SCAN_RESULTS;  // 0x0104 (first result's localId)

// External opmem I/O
const IO_EXT_TARGET_ID = 0x1000;
const IO_EXT_OFFSET    = 0x1001;
const IO_EXT_VALUE     = 0x1002;
const IO_EXT_VALUE_LOCAL_ID = 0x1005;
// External processor memory I/O
const IO_PMEM_TARGET_ID = 0x2000;
const IO_PMEM_ADDR      = 0x2001;
const IO_PMEM_VALUE     = 0x2002;
const IO_PMEM_AUTO_VALUE = 0x2003;

// Test object ids
const P1_ID = 1;
const P2_ID = 2;
const ASM_ID = 3;

function prog(...instrs: (number | readonly number[])[]): number[] {
  return instrs.flat() as number[];
}

function freshWorld(): World {
  return { ...createEmptyWorld(100, 100), nextObjectId: 100 };
}

describe('processor', () => {
  it('createProcessor creates a stopped processor', () => {
    const proc = createProcessor(P1_ID, { x: 10, y: 10 }, []);
    expect(proc.running).toBe(false);
    expect(proc.memory).toHaveLength(1024);
    expect(proc.operationMemory).toHaveLength(PROCESSOR_OPMEM_SIZE);
    expect(proc.groupId).toBeNull();
  });

  it('createProcessor with running=true starts running', () => {
    const proc = createProcessor(P1_ID, { x: 10, y: 10 }, [], true);
    expect(proc.running).toBe(true);
    expect(proc.operationMemory[PROC_OFF_RUN_FLAG]).toBe(1);
  });

  it('stopped processor does not execute', () => {
    let w = freshWorld();
    w = addObject(w, createProcessor(P1_ID, { x: 10, y: 10 }, prog(
      encodeR(Opcode.HALT, 0, 0, 0),
    ), false));
    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, P1_ID) as ProcessorObject;
    expect(updated.pc).toBe(0);
  });

  it('running processor executes LI and HALTs', () => {
    let w = freshWorld();
    w = addObject(w, createProcessor(P1_ID, { x: 10, y: 10 }, prog(
      encodeW(Opcode.LI, 1, 0, 42),
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, P1_ID) as ProcessorObject;
    expect(updated.registers[1]).toBe(42);
  });

  it('SCAN finds nearby assembler', () => {
    let w = freshWorld();
    const pos = { x: 10, y: 10 };
    w = addObject(w, createProcessor(P1_ID, pos, prog(
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FILTER),
      encodeR(Opcode.OUT, 0, 2, 1),       // scan_filter=1 (assembler)
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_TRIGGER),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      encodeW(Opcode.LI, 2, 0, IO_SCAN_COUNT),
      encodeR(Opcode.IN, 3, 2, 0),        // r3 = scan_count
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createAssembler(ASM_ID, { x: 11, y: 10 }));

    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, P1_ID) as ProcessorObject;
    expect(updated.registers[3]).toBe(1);
  });

  it('processor can write to assembler operation memory', () => {
    let w = freshWorld();
    const pos = { x: 10, y: 10 };
    w = addObject(w, createProcessor(P1_ID, pos, prog(
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FILTER),
      encodeR(Opcode.OUT, 0, 2, 1),       // scan_filter=1
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_TRIGGER),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FIRST_ID),
      encodeR(Opcode.IN, 3, 2, 0),        // r3 = localId
      encodeW(Opcode.LI, 2, 0, IO_EXT_TARGET_ID),
      encodeR(Opcode.OUT, 0, 2, 3),       // TARGET_ID = r3
      encodeW(Opcode.LI, 1, 0, 1),        // assembler opmem offset 1 = recipe
      encodeW(Opcode.LI, 2, 0, IO_EXT_OFFSET),
      encodeR(Opcode.OUT, 0, 2, 1),       // OFFSET = 1 (recipe)
      encodeW(Opcode.LI, 1, 0, 3),
      encodeW(Opcode.LI, 2, 0, IO_EXT_VALUE),
      encodeR(Opcode.OUT, 0, 2, 1),       // VALUE = 3 (set recipe = 3)
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createAssembler(ASM_ID, { x: 11, y: 10 }));

    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updatedAsm = getObject(result.world, ASM_ID) as AssemblerObject;
    // offset 1 = recipe
    expect(updatedAsm.operationMemory[1]).toBe(3);
  });

  it('processor can write to another processor memory via PMEM', () => {
    let w = freshWorld();
    const pos = { x: 10, y: 10 };
    w = addObject(w, createProcessor(P1_ID, pos, prog(
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FILTER),
      encodeR(Opcode.OUT, 0, 2, 1),       // scan_filter=2 (processor)
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_TRIGGER),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FIRST_ID),
      encodeR(Opcode.IN, 3, 2, 0),        // r3 = localId
      encodeW(Opcode.LI, 2, 0, IO_PMEM_TARGET_ID),
      encodeR(Opcode.OUT, 0, 2, 3),       // PMEM_TARGET_ID = r3
      encodeW(Opcode.LI, 1, 0, 0),
      encodeW(Opcode.LI, 2, 0, IO_PMEM_ADDR),
      encodeR(Opcode.OUT, 0, 2, 1),       // PMEM_ADDR = 0
      encodeW(Opcode.LI, 1, 0, 0xBEEF),
      encodeW(Opcode.LI, 2, 0, IO_PMEM_VALUE),
      encodeR(Opcode.OUT, 0, 2, 1),       // PMEM_VALUE = 0xBEEF
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createProcessor(P2_ID, { x: 11, y: 10 }, [], false));

    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updatedP2 = getObject(result.world, P2_ID) as ProcessorObject;
    expect(updatedP2.memory[0]).toBe(0xBEEF);
  });

  it('localId persists across ticks', () => {
    let w = freshWorld();
    const pos = { x: 10, y: 10 };
    w = addObject(w, createProcessor(P1_ID, pos, prog(
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FILTER),
      encodeR(Opcode.OUT, 0, 2, 1),
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_TRIGGER),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FIRST_ID),
      encodeR(Opcode.IN, 3, 2, 0),        // r3 = localId
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createProcessor(P2_ID, { x: 11, y: 10 }, [], false));

    const r1 = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const p1After1 = getObject(r1.world, P1_ID) as ProcessorObject;
    expect(p1After1.localIdTable.size).toBe(1);
    expect(p1After1.localIdCounter).toBe(2);
  });

  it('I/O registers persist across ticks for cross-tick copy', () => {
    let w = freshWorld();
    const pos = { x: 10, y: 10 };
    w = addObject(w, createProcessor(P1_ID, pos, prog(
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FILTER),
      encodeR(Opcode.OUT, 0, 2, 1),       // scan_filter=2
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_TRIGGER),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FIRST_ID),
      encodeR(Opcode.IN, 3, 2, 0),        // r3 = localId
      encodeW(Opcode.LI, 2, 0, IO_PMEM_TARGET_ID),
      encodeR(Opcode.OUT, 0, 2, 3),
      encodeW(Opcode.LI, 1, 0, 0),
      encodeW(Opcode.LI, 2, 0, IO_PMEM_ADDR),
      encodeR(Opcode.OUT, 0, 2, 1),       // PMEM_ADDR = 0
      encodeW(Opcode.LI, 1, 0, 0xAAAA),
      encodeW(Opcode.LI, 2, 0, IO_PMEM_AUTO_VALUE),
      encodeR(Opcode.OUT, 0, 2, 1),       // PMEM_AUTO_VALUE → addr auto-inc to 1
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createProcessor(P2_ID, { x: 11, y: 10 }, [], false));

    const r1 = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const p1After1 = getObject(r1.world, P1_ID) as ProcessorObject;
    expect(p1After1.ioRegisters.pmemAddr).toBe(1);

    const p2After1 = getObject(r1.world, P2_ID) as ProcessorObject;
    expect(p2After1.memory[0]).toBe(0xAAAA);

    // Tick 2: reuse persisted I/O state, write another word
    const p1Resume: ProcessorObject = {
      ...p1After1,
      memory: (() => {
        const mem = [...p1After1.memory];
        const resumeProg = prog(
          encodeW(Opcode.LI, 1, 0, 0xBBBB),
          encodeW(Opcode.LI, 2, 0, IO_PMEM_AUTO_VALUE),
          encodeR(Opcode.OUT, 0, 2, 1),
          encodeR(Opcode.HALT, 0, 0, 0),
        );
        for (let i = 0; i < resumeProg.length; i++) mem[i] = resumeProg[i];
        return mem;
      })(),
      pc: 0,
    };

    let w2 = r1.world;
    w2 = { ...w2, objects: w2.objects.map(o => o.id === P1_ID ? p1Resume : o) };

    const r2 = executeProcessorTick(w2, P1_ID, DEFAULT_GAME_PARAMS);
    const p2After2 = getObject(r2.world, P2_ID) as ProcessorObject;
    expect(p2After2.memory[0]).toBe(0xAAAA);
    expect(p2After2.memory[1]).toBe(0xBBBB);
  });

  it('LABEL acts as NOP', () => {
    let w = freshWorld();
    w = addObject(w, createProcessor(P1_ID, { x: 10, y: 10 }, prog(
      encodeW(Opcode.LI, 1, 0, 42),
      encodeLabel(7),
      encodeW(Opcode.LI, 2, 0, 99),
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, P1_ID) as ProcessorObject;
    expect(updated.registers[1]).toBe(42);
    expect(updated.registers[2]).toBe(99);
  });

  it('JMPL jumps to LABEL+1', () => {
    let w = freshWorld();
    w = addObject(w, createProcessor(P1_ID, { x: 10, y: 10 }, prog(
      encodeJmpl(13),
      encodeW(Opcode.LI, 1, 0, 0xDEAD),
      encodeR(Opcode.HALT, 0, 0, 0),
      encodeLabel(13),
      encodeW(Opcode.LI, 1, 0, 0xCAFE),
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, P1_ID) as ProcessorObject;
    expect(updated.registers[1]).toBe(0xCAFE);
  });

  it('JMPL falls through if no LABEL found', () => {
    let w = freshWorld();
    w = addObject(w, createProcessor(P1_ID, { x: 10, y: 10 }, prog(
      encodeJmpl(99),
      encodeW(Opcode.LI, 1, 0, 0xBEEF),
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, P1_ID) as ProcessorObject;
    expect(updated.registers[1]).toBe(0xBEEF);
  });

  it('LWL reads memory[label_addr+1+rs]', () => {
    let w = freshWorld();
    w = addObject(w, createProcessor(P1_ID, { x: 10, y: 10 }, prog(
      encodeW(Opcode.LI, 2, 0, 1),
      encodeLwl(1, 2, 5),
      encodeR(Opcode.HALT, 0, 0, 0),
      encodeLabel(5),
      0x1111,
      0x2222,
      0x3333,
    ), true));
    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, P1_ID) as ProcessorObject;
    expect(updated.registers[1]).toBe(0x2222);
  });

  it('SWL writes memory[label_addr+1+rs_idx]', () => {
    let w = freshWorld();
    w = addObject(w, createProcessor(P1_ID, { x: 10, y: 10 }, prog(
      encodeW(Opcode.LI, 1, 0, 0xABCD),
      encodeW(Opcode.LI, 2, 0, 2),
      encodeSwl(1, 2, 9),
      encodeR(Opcode.HALT, 0, 0, 0),
      encodeLabel(9),
      0,
      0,
      0,
    ), true));
    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, P1_ID) as ProcessorObject;
    expect(updated.memory[10]).toBe(0xABCD);
    expect(updated.memory[8]).toBe(0);
    expect(updated.memory[9]).toBe(0);
  });

  it('SWL with no matching label is a no-op', () => {
    let w = freshWorld();
    w = addObject(w, createProcessor(P1_ID, { x: 10, y: 10 }, prog(
      encodeW(Opcode.LI, 1, 0, 0xABCD),
      encodeW(Opcode.LI, 2, 0, 0),
      encodeSwl(1, 2, 99),
      encodeW(Opcode.LI, 3, 0, 0xCAFE),
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, P1_ID) as ProcessorObject;
    expect(updated.registers[3]).toBe(0xCAFE);
  });

  it('label cache invalidation: SW creates a new LABEL discoverable by JMPL', () => {
    let w = freshWorld();
    const labelWord = encodeLabel(5);
    w = addObject(w, createProcessor(P1_ID, { x: 10, y: 10 }, prog(
      encodeW(Opcode.LI, 1, 0, 14336),          // r1 = 14 << 10
      encodeI(Opcode.ADDI, 1, 1, 5),            // r1 += 5  → labelWord(5)
      encodeW(Opcode.LI, 2, 0, 50),
      encodeI(Opcode.SW, 1, 2, 0),              // mem[50] = labelWord(5)
      encodeJmpl(5),
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));

    const initialMem = (getObject(w, P1_ID) as ProcessorObject).memory;
    const newMem = [...initialMem];
    newMem[51] = encodeR(Opcode.HALT, 0, 0, 0);
    w = {
      ...w,
      objects: w.objects.map(o => o.id === P1_ID ? { ...(o as ProcessorObject), memory: newMem } : o),
    };

    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updated = getObject(result.world, P1_ID) as ProcessorObject;
    expect(updated.memory[50]).toBe(labelWord);
    expect(updated.pc).toBe(52);
  });

  it('processor can start another processor via its run_flag slot', () => {
    let w = freshWorld();
    const pos = { x: 10, y: 10 };
    w = addObject(w, createProcessor(P1_ID, pos, prog(
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FILTER),
      encodeR(Opcode.OUT, 0, 2, 1),
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_TRIGGER),
      encodeR(Opcode.OUT, 0, 2, 1),             // trigger SCAN
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FIRST_ID),
      encodeR(Opcode.IN, 3, 2, 0),              // r3 = localId
      encodeW(Opcode.LI, 2, 0, IO_EXT_TARGET_ID),
      encodeR(Opcode.OUT, 0, 2, 3),             // TARGET_ID = r3
      // Processor opmem offset 0 = run_flag
      encodeW(Opcode.LI, 1, 0, PROC_OFF_RUN_FLAG),
      encodeW(Opcode.LI, 2, 0, IO_EXT_OFFSET),
      encodeR(Opcode.OUT, 0, 2, 1),             // OFFSET = run_flag offset (0)
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_EXT_VALUE),
      encodeR(Opcode.OUT, 0, 2, 1),             // VALUE = 1
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createProcessor(P2_ID, { x: 11, y: 10 }, [], false));

    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const updatedP2 = getObject(result.world, P2_ID) as ProcessorObject;
    expect(updatedP2.running).toBe(true);
  });

  it('0x1005 OPMEM_VALUE_LOCAL_ID conversion works between two Processors', () => {
    // Scenario: P1 reads SCAN results (localId for ASM, localId for P2), then writes
    // the assembler's localId into P2's opmem[0] via 0x1005. P2 should acquire a
    // matching localId for that assembler's canonical id.
    let w = freshWorld();
    const pos = { x: 10, y: 10 };

    w = addObject(w, createProcessor(P1_ID, pos, prog(
      // Scan with filter=1 (assembler) to get asm localId in r3
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FILTER),
      encodeR(Opcode.OUT, 0, 2, 1),
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_TRIGGER),
      encodeR(Opcode.OUT, 0, 2, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FIRST_ID),
      encodeR(Opcode.IN, 3, 2, 0),         // r3 = asm localId

      // Re-scan with filter=2 (processor) to get p2 localId in r4
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FILTER),
      encodeR(Opcode.OUT, 0, 2, 1),
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_TRIGGER),
      encodeR(Opcode.OUT, 0, 2, 1),
      encodeW(Opcode.LI, 2, 0, IO_SCAN_FIRST_ID),
      encodeR(Opcode.IN, 4, 2, 0),         // r4 = p2 localId

      // TARGET = p2, OFFSET = 2 (scan_filter slot, harmless slot), VALUE_LOCAL_ID = asm localId
      encodeW(Opcode.LI, 2, 0, IO_EXT_TARGET_ID),
      encodeR(Opcode.OUT, 0, 2, 4),
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, IO_EXT_OFFSET),
      encodeR(Opcode.OUT, 0, 2, 1),
      encodeW(Opcode.LI, 2, 0, IO_EXT_VALUE_LOCAL_ID),
      encodeR(Opcode.OUT, 0, 2, 3),        // write r3 (asm localId)

      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createProcessor(P2_ID, { x: 11, y: 10 }, [], false));
    w = addObject(w, createAssembler(ASM_ID, { x: 9, y: 10 }));

    const result = executeProcessorTick(w, P1_ID, DEFAULT_GAME_PARAMS);
    const p2 = getObject(result.world, P2_ID) as ProcessorObject;

    // P2 should now have a localId entry mapping to ASM_ID.
    const p2Entries = Array.from(p2.localIdTable.entries());
    const mapsToAsm = p2Entries.find(([, canonical]) => canonical === ASM_ID);
    expect(mapsToAsm).toBeDefined();

    // And P2's opmem slot 2 should contain P2's localId for the assembler.
    const storedLocalId = p2.operationMemory[2];
    expect(storedLocalId).toBe(mapsToAsm![0]);
  });
});
