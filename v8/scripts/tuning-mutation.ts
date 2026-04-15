/**
 * Tuning script: investigate program mutation with reduced copy size and instructionsPerTick.
 *
 * Experiment parameters:
 *   - copySize = 132 (program 120 words + 10% buffer)
 *   - Copy loop = 132 × 4 = 528 instructions
 *   - instructionsPerTick = 176 (528 / 3)
 *   - World: 30×30
 *   - 500 ticks
 */

import { DEFAULT_GAME_PARAMS, type GameParams } from '../src/params.js';
import { createInitialState, type InitialStateConfig } from '../src/initial-state.js';
import { executeTick } from '../src/simulation.js';
import { generateReplicatorProgram } from '../src/programs.js';
import type { ProcessorObject, World } from '../src/types.js';

const TICKS = 500;
const COPY_SIZE = 132;
const IPT = 176;  // 528 / 3

function runExperiment(label: string, targetRunning: boolean) {
  // Reference programs must match experiment's targetRunning setting
  const programC = generateReplicatorProgram(3, { copySize: COPY_SIZE, targetRunning });
  const programD = generateReplicatorProgram(4, { copySize: COPY_SIZE, targetRunning });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== ${label} ===`);
  console.log(`copySize=${COPY_SIZE}, instructionsPerTick=${IPT}, targetRunning=${targetRunning}`);
  console.log(`programC: ${programC.length} words, programD: ${programD.length} words`);
  console.log(`${'='.repeat(60)}\n`);

  const params: GameParams = { ...DEFAULT_GAME_PARAMS, instructionsPerTick: IPT };
  const config: InitialStateConfig = {
    worldWidth: 30,
    worldHeight: 30,
    numSets: 20,
    metalPerSet: 10,
    circuitPerSet: 15,
    energyPerSet: 200,
    programOptions: { copySize: COPY_SIZE, targetRunning },
  };

  let world = createInitialState(config);
  let totalProduced = 0;

  for (let t = 0; t < TICKS; t++) {
    const result = executeTick(world, params);
    world = result.world;
    for (const ev of result.events) {
      if (ev.type === 'assembler_completed') totalProduced++;
    }
    if ((t + 1) % 100 === 0) {
      const stats = getStats(world);
      console.log(
        `tick ${String(world.tick).padStart(4)} | ` +
        `proc:${stats.proc}(r:${stats.running}) asm:${stats.asm} ` +
        `mat:${stats.mat} eng:${stats.eng} produced:${totalProduced}`
      );
    }
  }

  console.log('\n--- Memory Analysis ---');
  analyzeMemory(world, programC, programD);
}

function getStats(w: World) {
  let proc = 0, running = 0, asm = 0, mat = 0, eng = 0;
  for (const o of w.objects) {
    if (o.kind === 'processor') { proc++; if ((o as ProcessorObject).running) running++; }
    else if (o.kind === 'assembler') asm++;
    else if (o.kind === 'material') mat++;
    else if (o.kind === 'energy') eng++;
  }
  return { proc, running, asm, mat, eng };
}

function analyzeMemory(w: World, refC: number[], refD: number[]) {
  const processors = w.objects.filter(o => o.kind === 'processor') as ProcessorObject[];
  const initial = processors.filter(p => parseInt(p.id.replace('obj-', ''), 10) <= 600);
  const newProcs = processors.filter(p => parseInt(p.id.replace('obj-', ''), 10) > 600);

  let matchC = 0, matchD = 0, empty = 0, mutated = 0;
  const mutations: { id: string; running: boolean; diffC: number; diffD: number; copiedC: number; copiedD: number }[] = [];

  for (const proc of processors) {
    const isC = matchesProg(proc.memory, refC);
    const isD = matchesProg(proc.memory, refD);
    const isZero = proc.memory.every(w => w === 0);

    if (isC) matchC++;
    else if (isD) matchD++;
    else if (isZero) empty++;
    else {
      mutated++;
      mutations.push({
        id: proc.id,
        running: proc.running,
        diffC: countDiffs(proc.memory, refC),
        diffD: countDiffs(proc.memory, refD),
        copiedC: prefixMatch(proc.memory, refC),
        copiedD: prefixMatch(proc.memory, refD),
      });
    }
  }

  const newMatchC = newProcs.filter(p => matchesProg(p.memory, refC)).length;
  const newMatchD = newProcs.filter(p => matchesProg(p.memory, refD)).length;

  console.log(`Total Processors: ${processors.length} (initial: ${initial.length}, new: ${newProcs.length})`);
  console.log(`  Match programC: ${matchC} (initial: ${matchC - newMatchC}, new: ${newMatchC})`);
  console.log(`  Match programD: ${matchD} (initial: ${matchD - newMatchD}, new: ${newMatchD})`);
  console.log(`  All-zero: ${empty}`);
  console.log(`  Mutated: ${mutated}`);

  if (mutations.length > 0) {
    console.log('\n--- Mutated Processors ---');
    // Classify mutation type
    const chimeras: typeof mutations = [];   // mixed C+D
    const truncated: typeof mutations = [];  // partial single-program copy
    const other: typeof mutations = [];

    for (const m of mutations) {
      const mem = (w.objects.find(o => o.id === m.id) as ProcessorObject).memory;
      const type = classifyMutation(mem, refC, refD);
      if (type === 'chimera') chimeras.push(m);
      else if (type === 'truncated') truncated.push(m);
      else other.push(m);
    }

    if (chimeras.length > 0) {
      console.log(`\nChimeras (mixed C+D): ${chimeras.length}`);
      for (const m of chimeras.slice(0, 5)) {
        console.log(`  ${m.id} running=${m.running} diffC=${m.diffC} diffD=${m.diffD}`);
        describeChimera(w, m.id, refC, refD);
      }
    }
    if (truncated.length > 0) {
      console.log(`\nTruncated copies: ${truncated.length}`);
      for (const m of truncated.slice(0, 5)) {
        console.log(`  ${m.id} running=${m.running} prefixC=${m.copiedC} prefixD=${m.copiedD}`);
      }
    }
    if (other.length > 0) {
      console.log(`\nOther mutations: ${other.length}`);
      for (const m of other.slice(0, 5)) {
        console.log(`  ${m.id} running=${m.running} diffC=${m.diffC} diffD=${m.diffD}`);
      }
    }
  }

  // PC distribution of running processors
  console.log('\n--- Running Processor PC Distribution ---');
  const pcHist = new Map<number, number>();
  for (const p of processors.filter(p => p.running)) {
    pcHist.set(p.pc, (pcHist.get(p.pc) ?? 0) + 1);
  }
  for (const [pc, count] of [...pcHist.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  PC=${pc}: ${count}`);
  }
}

function classifyMutation(
  mem: readonly number[],
  refC: number[],
  refD: number[],
): 'chimera' | 'truncated' | 'other' {
  // Check if memory has segments matching both C and D
  let hasC = false, hasD = false;
  for (let i = 0; i < Math.max(refC.length, refD.length); i++) {
    const vc = i < refC.length ? refC[i] : 0;
    const vd = i < refD.length ? refD[i] : 0;
    const vm = i < mem.length ? mem[i] : 0;
    if (vc !== vd) {  // Only check where C and D differ
      if (vm === vc) hasC = true;
      if (vm === vd) hasD = true;
    }
  }
  if (hasC && hasD) return 'chimera';
  if (hasC || hasD) return 'truncated';
  return 'other';
}

function describeChimera(
  w: World,
  id: string,
  refC: number[],
  refD: number[],
) {
  const proc = w.objects.find(o => o.id === id) as ProcessorObject;
  const mem = proc.memory;
  // Find the switchover point: where does it change from matching one to matching the other?
  let lastMatch = '';
  for (let i = 0; i < Math.max(refC.length, refD.length); i++) {
    const vc = i < refC.length ? refC[i] : 0;
    const vd = i < refD.length ? refD[i] : 0;
    const vm = i < mem.length ? mem[i] : 0;
    if (vc === vd) continue;
    const matchesC = vm === vc;
    const matchesD = vm === vd;
    const cur = matchesC ? 'C' : matchesD ? 'D' : '?';
    if (cur !== lastMatch) {
      console.log(`    [${i}] switches to ${cur} (val=${vm})`);
      lastMatch = cur;
    }
  }
}

function matchesProg(mem: readonly number[], prog: number[]): boolean {
  for (let i = 0; i < mem.length; i++) {
    const expected = i < prog.length ? prog[i] : 0;
    if (mem[i] !== expected) return false;
  }
  return true;
}

function countDiffs(mem: readonly number[], prog: number[]): number {
  let d = 0;
  for (let i = 0; i < mem.length; i++) {
    const expected = i < prog.length ? prog[i] : 0;
    if (mem[i] !== expected) d++;
  }
  return d;
}

function prefixMatch(mem: readonly number[], prog: number[]): number {
  let n = 0;
  for (let i = 0; i < prog.length; i++) {
    if (mem[i] === prog[i]) n++;
    else break;
  }
  return n;
}

// ============================================================
// Run experiments
// ============================================================

// Experiment: proximityRange=1, randomMovementRange=0.75, targetRunning=true, ipt=176
{
  const label = 'Experiment: proximityRange=1, movement=0.75, ipt=176, targetRunning=true';
  const TR = true;
  const refC = generateReplicatorProgram(3, { copySize: COPY_SIZE, targetRunning: TR });
  const refD = generateReplicatorProgram(4, { copySize: COPY_SIZE, targetRunning: TR });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== ${label} ===`);
  console.log(`${'='.repeat(60)}\n`);

  const params4: GameParams = {
    ...DEFAULT_GAME_PARAMS,
    instructionsPerTick: IPT,
    proximityRange: 1.0,
    randomMovementRange: 0.75,  // default 0.5 * 1.5
  };
  const config4: InitialStateConfig = {
    worldWidth: 30, worldHeight: 30, numSets: 20,
    metalPerSet: 10, circuitPerSet: 15, energyPerSet: 200,
    programOptions: { copySize: COPY_SIZE, targetRunning: TR },
  };

  let w = createInitialState(config4);
  let prod = 0;
  for (let t = 0; t < TICKS; t++) {
    const r = executeTick(w, params4);
    w = r.world;
    for (const ev of r.events) if (ev.type === 'assembler_completed') prod++;
    if ((t + 1) % 100 === 0) {
      const s = getStats(w);
      console.log(
        `tick ${String(w.tick).padStart(4)} | ` +
        `proc:${s.proc}(r:${s.running}) asm:${s.asm} mat:${s.mat} eng:${s.eng} produced:${prod}`
      );
    }
  }
  console.log('\n--- Memory Analysis ---');
  analyzeMemory(w, refC, refD);
}

// Experiment B: same params but smaller world (15x15) + spacing=0.5 to fit inside proximityRange
{
  const label = 'Experiment B: proximityRange=1, movement=0.75, 15x15, 1000 ticks';
  const TR = true;
  const refC = generateReplicatorProgram(3, { copySize: COPY_SIZE, targetRunning: TR });
  const refD = generateReplicatorProgram(4, { copySize: COPY_SIZE, targetRunning: TR });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== ${label} ===`);
  console.log(`${'='.repeat(60)}\n`);

  const params5: GameParams = {
    ...DEFAULT_GAME_PARAMS,
    instructionsPerTick: IPT,
    proximityRange: 1.0,
    randomMovementRange: 0.75,
  };
  const config5: InitialStateConfig = {
    worldWidth: 15, worldHeight: 15, numSets: 20,
    metalPerSet: 10, circuitPerSet: 15, energyPerSet: 200,
    programOptions: { copySize: COPY_SIZE, targetRunning: TR },
  };

  let w = createInitialState(config5);
  let prod = 0;
  const TICKS2 = 1000;
  for (let t = 0; t < TICKS2; t++) {
    const r = executeTick(w, params5);
    w = r.world;
    for (const ev of r.events) if (ev.type === 'assembler_completed') prod++;
    if ((t + 1) % 200 === 0) {
      const s = getStats(w);
      console.log(
        `tick ${String(w.tick).padStart(4)} | ` +
        `proc:${s.proc}(r:${s.running}) asm:${s.asm} mat:${s.mat} eng:${s.eng} produced:${prod}`
      );
    }
  }
  console.log('\n--- Memory Analysis ---');
  analyzeMemory(w, refC, refD);
}
