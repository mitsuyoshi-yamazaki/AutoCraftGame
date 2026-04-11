import { createProcessor, executeProcessorTick } from '../src/processor.js';
import { createEmptyWorld, addObject } from '../src/world.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { ProcessorObject } from '../src/types.js';
import { Opcode, encodeR, encodeW } from '../src/vm/vm.js';

function prog(...i: (number | readonly number[])[]): number[] { return i.flat() as number[]; }

let w = createEmptyWorld(20, 20);
w = addObject(w, createProcessor('p1', {x:10,y:10}, prog(
  encodeW(Opcode.LI, 1, 0, 2),
  encodeW(Opcode.LI, 2, 0, 0x0103),
  encodeR(Opcode.OUT, 0, 2, 1),
  encodeW(Opcode.LI, 1, 0, 1),
  encodeW(Opcode.LI, 2, 0, 0x0101),
  encodeR(Opcode.OUT, 0, 2, 1),
  encodeW(Opcode.LI, 2, 0, 0x0104),
  encodeR(Opcode.IN, 5, 2, 0),
  encodeW(Opcode.LI, 2, 0, 0x0105),
  encodeR(Opcode.IN, 3, 2, 0),
  encodeW(Opcode.LI, 2, 0, 0x1000),
  encodeR(Opcode.OUT, 0, 2, 3),
  encodeW(Opcode.LI, 1, 0, 2),
  encodeW(Opcode.LI, 2, 0, 0x1001),
  encodeR(Opcode.OUT, 0, 2, 1),
  encodeW(Opcode.LI, 1, 0, 1),
  encodeW(Opcode.LI, 2, 0, 0x1002),
  encodeR(Opcode.OUT, 0, 2, 1),
  encodeR(Opcode.HALT, 0, 0, 0),
), true));
w = addObject(w, createProcessor('p2', {x:11,y:10}, [], false));

const r = executeProcessorTick(w, 'p1', DEFAULT_GAME_PARAMS);
const p1 = r.world.objects.find(o => o.id === 'p1') as ProcessorObject;
const p2 = r.world.objects.find(o => o.id === 'p2') as ProcessorObject;
console.log('p1 r5 (count):', p1.registers[5]);
console.log('p1 r3 (localId):', p1.registers[3]);
console.log('p2 running:', p2.running);
console.log('p2 opmem[2]:', p2.operationMemory[2]);
