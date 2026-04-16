/**
 * Trace event timing for a single replicator cycle to verify the
 * "stale last_product_id" bug hypothesis.
 */
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createInitialState, DEFAULT_INITIAL_CONFIG } from '../src/initial-state.js';
import { executeTick } from '../src/simulation.js';
import type { ProcessorObject, AssemblerObject, GroupObject } from '../src/types.js';

let s = 42 >>> 0;
Math.random = () => {
  s = (s * 1664525 + 1013904223) >>> 0;
  return s / 0x100000000;
};

let world = createInitialState(DEFAULT_INITIAL_CONFIG);
const TICKS = 120;

// Focus on one Processor, e.g. id=2 (the first processor) and watch its
// assembler partner's opmem & group transitions.
const TRACK_PROC_ID = 2;
const TRACK_ASM_ID = 1;

for (let t = 0; t < TICKS; t++) {
  const r = executeTick(world, DEFAULT_GAME_PARAMS);
  world = r.world;
  const proc = world.objects.find(o => o.id === TRACK_PROC_ID) as ProcessorObject;
  const asm = world.objects.find(o => o.id === TRACK_ASM_ID) as AssemblerObject;
  if (!proc || !asm) continue;
  const asmOp = asm.operationMemory;
  // Print when interesting
  const hasEvents = r.events.length > 0;
  const interesting = hasEvents || (t >= 55 && t <= 90);
  if (interesting) {
    const g = world.objects.find(o => o.kind === 'group' && (o as GroupObject).memberIds.includes(asm.id)) as GroupObject | undefined;
    const groupInfo = g ? `g${g.id}:[${g.memberIds.join(',')}]` : 'freestanding';
    console.log(`t=${t} procPc=${proc.pc} r4=${proc.registers[4]} r7=${proc.registers[7]} | asm1 phase=${asm.phase} rec=${asm.recipe} tr=${asmOp[0]} cn=${asmOp[2]} last=${asmOp[5]} dTr=${asmOp[6]} dTg=${asmOp[7]} | ${groupInfo}`);
    for (const e of r.events) {
      console.log(`    EVENT: ${JSON.stringify(e)}`);
    }
  }
}
