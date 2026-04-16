/**
 * Quick script to dump one hijacker-class proc's memory and compare it
 * to canonical hijacker + canonical v2 to confirm the "hij[0..97] +
 * v2_residue[97..184] + zeros[184..]" hypothesis.
 *
 * Usage: npx tsx scripts/inspect-hij-mem.ts [config.json]
 */

import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createInitialState, DEFAULT_INITIAL_CONFIG } from '../src/initial-state.js';
import { generateReplicatorProgramV2, generateHijackerProgram } from '../src/programs.js';
import { executeTick } from '../src/simulation.js';
import type { ProcessorObject } from '../src/types.js';

const ticks = 5000;
const seed = 1;

let s = seed >>> 0;
Math.random = () => {
  s = (s * 1664525 + 1013904223) >>> 0;
  return s / 0x100000000;
};

const v2 = generateReplicatorProgramV2({});
const hij = generateHijackerProgram({});

let world = createInitialState({
  ...DEFAULT_INITIAL_CONFIG,
  worldWidth: 50, worldHeight: 50, numSets: 5,
  metalPerSet: 20, circuitPerSet: 30, energyPerSet: 400,
  programVariant: 'v2',
  hijackerCount: 1,
});

for (let t = 0; t < ticks; t++) {
  const r = executeTick(world, DEFAULT_GAME_PARAMS);
  world = r.world;
}

const procs = world.objects.filter(o => o.kind === 'processor') as ProcessorObject[];
const hijLike = procs.filter(p => {
  for (let i = 0; i < hij.length; i++) if (p.memory[i] !== hij[i]) return false;
  return true;
});

console.log(`# Inspecting ${hijLike.length} procs whose [0..${hij.length}) exactly matches canonical hijacker`);
console.log(`v2 length: ${v2.length}, hij length: ${hij.length}`);
console.log('');

if (hijLike.length === 0) {
  console.log('No procs with exact hij prefix match.');
  process.exit(0);
}

const sample = hijLike[0];
console.log(`## Sample proc id=${sample.id}`);
console.log(`Memory[97..184] (= "tail residue"):`);
for (let i = hij.length; i < v2.length; i++) {
  const w = sample.memory[i] ?? 0;
  const v2w = v2[i] ?? 0;
  const matches = w === v2w ? 'MATCH-V2' : '!!DIFFER';
  console.log(`  mem[${i.toString().padStart(3)}] = ${w.toString(16).padStart(4, '0')}  v2[${i.toString().padStart(3)}] = ${v2w.toString(16).padStart(4, '0')}  ${matches}`);
}
console.log('');

console.log(`Memory[184..1024]: scanning for any non-zero...`);
let nz = 0;
for (let i = v2.length; i < sample.memory.length; i++) {
  if (sample.memory[i] !== 0) {
    if (nz < 10) console.log(`  mem[${i}] = ${sample.memory[i]}`);
    nz++;
  }
}
console.log(`  total non-zero in tail [${v2.length}..1024): ${nz}`);
console.log('');

// Verify: are all hijLike procs IDENTICAL?
let allIdentical = true;
for (const p of hijLike) {
  for (let i = 0; i < p.memory.length; i++) {
    if (p.memory[i] !== sample.memory[i]) { allIdentical = false; break; }
  }
  if (!allIdentical) break;
}
console.log(`All ${hijLike.length} hij-like procs have IDENTICAL memory: ${allIdentical}`);
