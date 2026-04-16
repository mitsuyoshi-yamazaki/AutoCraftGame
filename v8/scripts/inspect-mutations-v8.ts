/**
 * Deep-inspect surviving Processors' memory diffs against canonical v2 and hijacker.
 * Identifies:
 *   - which positions are mutated (= differ from both canonicals)
 *   - what opcode-class the mutated word encodes (SW/SWL/PUSH/POP = memory-writing)
 *   - whether the proc has an unusual prefix/suffix pattern
 *
 * Usage: npx tsx scripts/inspect-mutations-v8.ts [config.json]
 */

import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import {
  createInitialState,
  DEFAULT_INITIAL_CONFIG,
  type InitialStateConfig,
} from '../src/initial-state.js';
import { generateReplicatorProgramV2, generateHijackerProgram } from '../src/programs.js';
import { executeTick } from '../src/simulation.js';
import type { ProcessorObject } from '../src/types.js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const configPath = args[0];
let data: any = {};
if (configPath) data = JSON.parse(readFileSync(configPath, 'utf8'));
const seed = data.seed ?? 1;
const ticks = data.ticks ?? 30000;
const initial: InitialStateConfig = { ...DEFAULT_INITIAL_CONFIG, ...(data.initial ?? {}) };
const params = { ...DEFAULT_GAME_PARAMS, ...(data.params ?? {}) };

let s = seed >>> 0;
Math.random = () => {
  s = (s * 1664525 + 1013904223) >>> 0;
  return s / 0x100000000;
};

const v2 = generateReplicatorProgramV2({});
const hij = generateHijackerProgram({});

let world = createInitialState(initial);
for (let t = 0; t < ticks; t++) {
  const r = executeTick(world, params);
  world = r.world;
}

const opcodeName = (w: number): string => {
  const op = (w >> 10) & 0x3F;
  const names: Record<number, string> = {
    0: 'ADD', 1: 'SUB', 2: 'MUL', 3: 'DIV', 4: 'MOD',
    5: 'AND', 6: 'OR', 7: 'XOR', 8: 'SHL', 9: 'SHR',
    10: 'IN', 11: 'OUT', 12: 'JALR', 13: 'CKPT',
    14: 'LABEL', 15: 'JMPL',
    16: 'ADDI', 17: 'LW', 18: 'SW', 19: 'PUSH', 20: 'POP',
    21: 'LWL', 22: 'SWL',
    24: 'BEQ', 25: 'BNE', 26: 'BLT', 27: 'BGE',
    32: 'LI', 33: 'JMP',
    34: 'BEQL', 35: 'BNEL', 36: 'BLTL', 37: 'BGEL',
    63: 'HALT',
  };
  return names[op] ?? `OP${op}`;
};

const isMemWrite = (w: number): boolean => {
  const op = (w >> 10) & 0x3F;
  return op === 18 || op === 19 || op === 20 || op === 22;  // SW, PUSH, POP, SWL
};

const procs = world.objects.filter((o): o is ProcessorObject => o.kind === 'processor');
console.log(`# Deep mutation inspection (seed=${seed}, ticks=${ticks})`);
console.log(`v2 len=${v2.length}, hij len=${hij.length}, total procs=${procs.length}`);
console.log('');

// Classify each proc's diffs from BOTH canonicals, categorize, and pick interesting ones
interface ProcInfo {
  p: ProcessorObject;
  diffsHij: number;
  diffsV2: number;
  diffsBoth: number;  // positions that differ from BOTH
  memWriteOps: number;  // SW/SWL/PUSH/POP in memory
}

const infos: ProcInfo[] = procs.map(p => {
  let dHij = 0, dV2 = 0, dBoth = 0, mw = 0;
  for (let i = 0; i < p.memory.length; i++) {
    const w = p.memory[i] ?? 0;
    const hv = hij[i] ?? 0;
    const vv = v2[i] ?? 0;
    if (w !== hv) dHij++;
    if (w !== vv) dV2++;
    // "novel" = word is not 0, not hij[i], not v2[i]
    if (w !== 0 && w !== hv && w !== vv) dBoth++;
    if (isMemWrite(w)) mw++;
  }
  return { p, diffsHij: dHij, diffsV2: dV2, diffsBoth: dBoth, memWriteOps: mw };
});

// Sort by "interestingness" — procs that differ from both canonicals most
infos.sort((a, b) => b.diffsBoth - a.diffsBoth);

// "Positional anomaly": words where proc[i] is nonzero AND canonical at that position is zero.
// This detects REARRANGEMENT: where in the sim a word from v2's code region got copied to
// a position beyond v2's length (i.e. >184), or hij's code beyond 97. These are strong signals
// of nontrivial mutation because hij+v2_tail pattern has all zeros past 184.
function positionalAnomalyCount(mem: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < mem.length; i++) {
    const w = mem[i] ?? 0;
    if (w === 0) continue;
    const hv = hij[i] ?? 0;
    const vv = v2[i] ?? 0;
    if (hv === 0 && vv === 0) n++;  // nonzero at position where both canonicals are zero
  }
  return n;
}

console.log(`## Overview (sorted by novelty)`);
console.log(`  id | dHij | dV2 | dBoth | posAnom | memWr | class`);
for (const info of infos) {
  const { p, diffsHij, diffsV2, diffsBoth, memWriteOps } = info;
  let cls = 'junk';
  const memHasHijFilter = p.memory.some((w, i) => w === 0x0102 && i > 0 && p.memory[i-1] === 0x8100);
  const memHasV2Filter = p.memory.some((w, i) => w === 0x0125 && i > 0 && p.memory[i-1] === 0x8100);
  if (diffsHij === 0 && p.memory.slice(hij.length).every(w => w === 0)) cls = 'pristineHij';
  else if (diffsV2 === 0 && p.memory.slice(v2.length).every(w => w === 0)) cls = 'pristineV2';
  else if (memHasHijFilter && memHasV2Filter) cls = 'hybrid';
  else if (memHasHijFilter) cls = 'hij_variant';
  else if (memHasV2Filter) cls = 'v2_variant';
  const posAnom = positionalAnomalyCount(p.memory);
  console.log(
    `${String(p.id).padStart(4)} | ${String(diffsHij).padStart(4)} | ${String(diffsV2).padStart(3)} | ` +
    `${String(diffsBoth).padStart(5)} | ${String(posAnom).padStart(7)} | ${String(memWriteOps).padStart(5)} | ${cls}`
  );
}
console.log('');

// Dump interesting: either truly novel (diffsBoth > 0) or unusual diff pattern
// where proc differs from BOTH canonicals by non-standard amounts.
// Standard hij+v2_tail: diffsHij=83, diffsV2=93. pristineV2: diffsHij=176, diffsV2=0.
// Anything else is "interesting".
const isUnusual = (info: ProcInfo): boolean => {
  const { diffsHij: dh, diffsV2: dv } = info;
  if (dh === 0 && dv === 176) return false;  // pristine hij
  if (dh === 176 && dv === 0) return false;  // pristine v2
  if (dh === 83 && dv === 93) return false;  // standard hij+v2_tail
  if (dh === 96 && dv === 178) return false; // all-zero (96=hij_len-1, 178=v2_len-6)
  return dh > 0 && dv > 0;
};
const novelSorted = infos.filter(isUnusual).sort((a, b) => Math.abs(b.diffsHij - 83) + Math.abs(b.diffsV2 - 93) - (Math.abs(a.diffsHij - 83) + Math.abs(a.diffsV2 - 93))).slice(0, 5);
for (const { p, diffsHij, diffsV2, diffsBoth, memWriteOps } of novelSorted) {
  console.log(`## Proc id=${p.id} (diffsHij=${diffsHij} diffsV2=${diffsV2} diffsBoth=${diffsBoth} memWrOps=${memWriteOps}) PC=${p.pc} running=${p.running}`);
  // For each position, mark origin: hij-matches, v2-matches, both-zero, novel
  console.log(`  position map: H=matches-hij V=matches-v2 0=zero-in-all . =no-mismatch-to-note X=novel`);
  // Show compressed view: 80 chars wide, per 16 positions → . / V / H / X
  const out: string[] = [];
  for (let i = 0; i < p.memory.length; i += 1) {
    const w = p.memory[i] ?? 0;
    const hv = hij[i] ?? 0;
    const vv = v2[i] ?? 0;
    const mHij = w === hv;
    const mV2 = w === vv;
    if (w === 0 && hv === 0 && vv === 0) out.push('.');
    else if (mHij && mV2) out.push('=');
    else if (mHij) out.push('H');
    else if (mV2) out.push('V');
    else if (w === 0) out.push('0');
    else out.push('X');
  }
  for (let i = 0; i < out.length; i += 64) {
    console.log(`  [${String(i).padStart(4)}] ${out.slice(i, i + 64).join('')}`);
    if (i >= 320) { console.log(`  ...`); break; }
  }
  console.log('');
}
