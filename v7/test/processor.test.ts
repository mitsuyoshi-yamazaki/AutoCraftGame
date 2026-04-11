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
