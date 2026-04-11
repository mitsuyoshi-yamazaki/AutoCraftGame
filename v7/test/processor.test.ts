import { describe, it, expect } from 'vitest';
import { createProcessor, executeProcessorTick, PROCESSOR_OPMEM_SIZE } from '../src/processor.js';
import { createAssembler } from '../src/assembler.js';
import { createEmptyWorld, addObject } from '../src/world.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { ProcessorObject, AssemblerObject } from '../src/types.js';
import { Opcode, encodeR, encodeW } from '../src/vm/vm.js';

function prog(...instrs: (number | readonly number[])[]): number[] {
  return instrs.flat() as number[];
}

describe('processor', () => {
  it('createProcessor creates a stopped processor', () => {
    const proc = createProcessor('p1', { x: 10, y: 10 }, []);
    expect(proc.running).toBe(false);
    expect(proc.memory).toHaveLength(1024);
    expect(proc.operationMemory).toHaveLength(PROCESSOR_OPMEM_SIZE);
  });

  it('createProcessor with running=true starts running', () => {
    const proc = createProcessor('p1', { x: 10, y: 10 }, [], true);
    expect(proc.running).toBe(true);
    expect(proc.operationMemory[2]).toBe(1);
  });

  it('stopped processor does not execute', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, createProcessor('p1', { x: 10, y: 10 }, prog(
      encodeR(Opcode.HALT, 0, 0, 0),
    ), false));
    const result = executeProcessorTick(w, 'p1', DEFAULT_GAME_PARAMS);
    const updated = result.world.objects.find(o => o.id === 'p1') as ProcessorObject;
    expect(updated.pc).toBe(0);
  });

  it('running processor executes LI and HALTs', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, createProcessor('p1', { x: 10, y: 10 }, prog(
      encodeW(Opcode.LI, 1, 0, 42),
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    const result = executeProcessorTick(w, 'p1', DEFAULT_GAME_PARAMS);
    const updated = result.world.objects.find(o => o.id === 'p1') as ProcessorObject;
    expect(updated.registers[1]).toBe(42);
  });

  it('SCAN finds nearby assembler', () => {
    let w = createEmptyWorld(100, 100);
    const pos = { x: 10, y: 10 };
    w = addObject(w, createProcessor('p1', pos, prog(
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, 0x0103),
      encodeR(Opcode.OUT, 0, 2, 1),       // scan_filter=1
      encodeW(Opcode.LI, 2, 0, 0x0101),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      encodeW(Opcode.LI, 2, 0, 0x0104),
      encodeR(Opcode.IN, 3, 2, 0),        // r3 = scan_count
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createAssembler('asm-1', { x: 11, y: 10 }));

    const result = executeProcessorTick(w, 'p1', DEFAULT_GAME_PARAMS);
    const updated = result.world.objects.find(o => o.id === 'p1') as ProcessorObject;
    expect(updated.registers[3]).toBe(1);
  });

  it('processor can write to assembler operation memory', () => {
    let w = createEmptyWorld(100, 100);
    const pos = { x: 10, y: 10 };
    w = addObject(w, createProcessor('p1', pos, prog(
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, 0x0103),
      encodeR(Opcode.OUT, 0, 2, 1),       // scan_filter=1
      encodeW(Opcode.LI, 2, 0, 0x0101),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      encodeW(Opcode.LI, 2, 0, 0x0105),
      encodeR(Opcode.IN, 3, 2, 0),        // r3 = localId
      encodeW(Opcode.LI, 2, 0, 0x1000),
      encodeR(Opcode.OUT, 0, 2, 3),       // TARGET_ID = r3
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, 0x1001),
      encodeR(Opcode.OUT, 0, 2, 1),       // OFFSET = 2
      encodeW(Opcode.LI, 1, 0, 3),
      encodeW(Opcode.LI, 2, 0, 0x1002),
      encodeR(Opcode.OUT, 0, 2, 1),       // VALUE = 3
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createAssembler('asm-1', { x: 11, y: 10 }));

    const result = executeProcessorTick(w, 'p1', DEFAULT_GAME_PARAMS);
    const updatedAsm = result.world.objects.find(o => o.id === 'asm-1') as AssemblerObject;
    expect(updatedAsm.operationMemory[2]).toBe(3);
  });

  it('processor can write to another processor memory', () => {
    let w = createEmptyWorld(100, 100);
    const pos = { x: 10, y: 10 };
    w = addObject(w, createProcessor('p1', pos, prog(
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, 0x0103),
      encodeR(Opcode.OUT, 0, 2, 1),       // scan_filter=2
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, 0x0101),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      encodeW(Opcode.LI, 2, 0, 0x0105),
      encodeR(Opcode.IN, 3, 2, 0),        // r3 = localId
      encodeW(Opcode.LI, 2, 0, 0x2000),
      encodeR(Opcode.OUT, 0, 2, 3),       // PMEM_TARGET_ID = r3
      encodeW(Opcode.LI, 1, 0, 0),
      encodeW(Opcode.LI, 2, 0, 0x2001),
      encodeR(Opcode.OUT, 0, 2, 1),       // PMEM_ADDR = 0
      encodeW(Opcode.LI, 1, 0, 0xBEEF),
      encodeW(Opcode.LI, 2, 0, 0x2002),
      encodeR(Opcode.OUT, 0, 2, 1),       // PMEM_VALUE = 0xBEEF
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createProcessor('p2', { x: 11, y: 10 }, [], false));

    const result = executeProcessorTick(w, 'p1', DEFAULT_GAME_PARAMS);
    const updatedP2 = result.world.objects.find(o => o.id === 'p2') as ProcessorObject;
    expect(updatedP2.memory[0]).toBe(0xBEEF);
  });

  it('localId persists across ticks', () => {
    let w = createEmptyWorld(100, 100);
    const pos = { x: 10, y: 10 };
    // Tick 1: SCAN to get localId, then HALT
    w = addObject(w, createProcessor('p1', pos, prog(
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, 0x0103),
      encodeR(Opcode.OUT, 0, 2, 1),       // scan_filter=2
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, 0x0101),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      encodeW(Opcode.LI, 2, 0, 0x0105),
      encodeR(Opcode.IN, 3, 2, 0),        // r3 = localId
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createProcessor('p2', { x: 11, y: 10 }, [], false));

    const r1 = executeProcessorTick(w, 'p1', DEFAULT_GAME_PARAMS);
    const p1After1 = r1.world.objects.find(o => o.id === 'p1') as ProcessorObject;
    expect(p1After1.localIdTable.size).toBe(1);
    expect(p1After1.localIdCounter).toBe(2);
  });

  it('I/O registers persist across ticks for cross-tick copy', () => {
    let w = createEmptyWorld(100, 100);
    const pos = { x: 10, y: 10 };
    // Program: SCAN, set PMEM_TID, set PMEM_ADDR=0, write one word via PMEM_AUTO_VALUE, HALT
    w = addObject(w, createProcessor('p1', pos, prog(
      // SCAN for processors
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, 0x0103),
      encodeR(Opcode.OUT, 0, 2, 1),       // scan_filter=2
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, 0x0101),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      // Read localId
      encodeW(Opcode.LI, 2, 0, 0x0105),
      encodeR(Opcode.IN, 3, 2, 0),        // r3 = localId
      // Set PMEM target and addr
      encodeW(Opcode.LI, 2, 0, 0x2000),
      encodeR(Opcode.OUT, 0, 2, 3),       // PMEM_TARGET_ID = r3
      encodeW(Opcode.LI, 1, 0, 0),
      encodeW(Opcode.LI, 2, 0, 0x2001),
      encodeR(Opcode.OUT, 0, 2, 1),       // PMEM_ADDR = 0
      // Write one word via AUTO_VALUE
      encodeW(Opcode.LI, 1, 0, 0xAAAA),
      encodeW(Opcode.LI, 2, 0, 0x2003),
      encodeR(Opcode.OUT, 0, 2, 1),       // PMEM_AUTO_VALUE = 0xAAAA → addr auto-inc to 1
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createProcessor('p2', { x: 11, y: 10 }, [], false));

    // Tick 1: SCAN + setup + write one word
    const r1 = executeProcessorTick(w, 'p1', DEFAULT_GAME_PARAMS);
    const p1After1 = r1.world.objects.find(o => o.id === 'p1') as ProcessorObject;
    expect(p1After1.ioRegisters.pmemAddr).toBe(1);  // auto-incremented

    const p2After1 = r1.world.objects.find(o => o.id === 'p2') as ProcessorObject;
    expect(p2After1.memory[0]).toBe(0xAAAA);

    // Tick 2: Write another word using persisted PMEM_TARGET_ID and PMEM_ADDR
    // Replace p1's program at current PC with just another AUTO_VALUE write + HALT
    // Simpler: create a new p1 that resumes with the persisted I/O state
    const p1Resume: ProcessorObject = {
      ...p1After1,
      // Overwrite program from PC=0: just write one more word and HALT
      memory: (() => {
        const mem = [...p1After1.memory];
        const resumeProg = prog(
          encodeW(Opcode.LI, 1, 0, 0xBBBB),
          encodeW(Opcode.LI, 2, 0, 0x2003),
          encodeR(Opcode.OUT, 0, 2, 1),     // PMEM_AUTO_VALUE = 0xBBBB → addr auto-inc to 2
          encodeR(Opcode.HALT, 0, 0, 0),
        );
        for (let i = 0; i < resumeProg.length; i++) mem[i] = resumeProg[i];
        return mem;
      })(),
      pc: 0,
    };

    let w2 = r1.world;
    w2 = { ...w2, objects: w2.objects.map(o => o.id === 'p1' ? p1Resume : o) };

    const r2 = executeProcessorTick(w2, 'p1', DEFAULT_GAME_PARAMS);
    const p2After2 = r2.world.objects.find(o => o.id === 'p2') as ProcessorObject;
    expect(p2After2.memory[0]).toBe(0xAAAA);  // from tick 1
    expect(p2After2.memory[1]).toBe(0xBBBB);  // from tick 2 (persisted pmemAddr=1)
  });

  it('processor can start another processor', () => {
    let w = createEmptyWorld(100, 100);
    const pos = { x: 10, y: 10 };
    w = addObject(w, createProcessor('p1', pos, prog(
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, 0x0103),
      encodeR(Opcode.OUT, 0, 2, 1),
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, 0x0101),
      encodeR(Opcode.OUT, 0, 2, 1),       // trigger SCAN
      encodeW(Opcode.LI, 2, 0, 0x0105),
      encodeR(Opcode.IN, 3, 2, 0),
      encodeW(Opcode.LI, 2, 0, 0x1000),
      encodeR(Opcode.OUT, 0, 2, 3),       // TARGET_ID = r3
      encodeW(Opcode.LI, 1, 0, 2),
      encodeW(Opcode.LI, 2, 0, 0x1001),
      encodeR(Opcode.OUT, 0, 2, 1),       // OFFSET = 2 (run_flag)
      encodeW(Opcode.LI, 1, 0, 1),
      encodeW(Opcode.LI, 2, 0, 0x1002),
      encodeR(Opcode.OUT, 0, 2, 1),       // VALUE = 1
      encodeR(Opcode.HALT, 0, 0, 0),
    ), true));
    w = addObject(w, createProcessor('p2', { x: 11, y: 10 }, [], false));

    const result = executeProcessorTick(w, 'p1', DEFAULT_GAME_PARAMS);
    const updatedP2 = result.world.objects.find(o => o.id === 'p2') as ProcessorObject;
    expect(updatedP2.running).toBe(true);
  });
});
