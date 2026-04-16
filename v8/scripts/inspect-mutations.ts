/** Inspect mutated child processors from v2 run. */
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createInitialState, DEFAULT_INITIAL_CONFIG } from '../src/initial-state.js';
import { executeTick } from '../src/simulation.js';
import type { ProcessorObject, AssemblerObject } from '../src/types.js';

let s = 1 >>> 0;
Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };

let world = createInitialState({ ...DEFAULT_INITIAL_CONFIG, programVariant: 'v2' });

const initialProcs = world.objects.filter(o => o.kind === 'processor') as ProcessorObject[];
const initialProg = [...initialProcs[0].memory];
const initialProcIds = new Set(initialProcs.map(p => p.id));

for (let t = 0; t < 1000; t++) {
  const r = executeTick(world, DEFAULT_GAME_PARAMS);
  world = r.world;
}

const children = (world.objects.filter(o => o.kind === 'processor') as ProcessorObject[])
  .filter(p => !initialProcIds.has(p.id));

const mutated = children.filter(p => {
  for (let i = 0; i < initialProg.length; i++) {
    if ((p.memory[i] ?? 0) !== initialProg[i]) return true;
  }
  return false;
});

console.log(`Total children: ${children.length}, mutated: ${mutated.length}`);

for (const m of mutated.slice(0, 3)) {
  console.log(`\nChild id=${m.id} running=${m.running} pc=${m.pc} group=${m.groupId}`);
  const diffs: {pos: number; exp: number; got: number}[] = [];
  for (let i = 0; i < 1024; i++) {
    const e = initialProg[i] ?? 0;
    const g = m.memory[i] ?? 0;
    if (e !== g) diffs.push({ pos: i, exp: e, got: g });
  }
  console.log(`  diff count: ${diffs.length}`);
  console.log(`  first 30 diffs:`);
  for (const d of diffs.slice(0, 30)) {
    console.log(`    mem[${d.pos}]: 0x${d.exp.toString(16).padStart(4,'0')} → 0x${d.got.toString(16).padStart(4,'0')}`);
  }
}

// Are mutated procs still meaningful? Check if they're running, did they produce offspring, etc.
console.log(`\nMutated processor stats:`);
console.log(`- running: ${mutated.filter(p => p.running).length}`);
console.log(`- halted: ${mutated.filter(p => !p.running).length}`);

// Stopped procs distribution in all children
console.log(`\nAll children running: ${children.filter(p => p.running).length}/${children.length}`);
