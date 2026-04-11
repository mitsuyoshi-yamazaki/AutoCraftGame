/**
 * Tuning script: investigate program mutation with reduced instructionsPerTick
 * and smaller world size.
 *
 * Experiment:
 *   - instructionsPerTick = 1000 (vs default 10000)
 *   - World size = 30x30 (vs default 100x100)
 *   - 500 ticks
 *   - Compare all Processor memories against original programs
 */

import { DEFAULT_GAME_PARAMS, type GameParams } from '../src/params.js';
import { createInitialState, type InitialStateConfig } from '../src/initial-state.js';
import { executeTick } from '../src/simulation.js';
import { generateReplicatorProgram } from '../src/programs.js';
import type { ProcessorObject, AssemblerObject, World } from '../src/types.js';

const TICKS = 500;
const REPORT_INTERVAL = 100;

// Modified parameters
const params: GameParams = {
  ...DEFAULT_GAME_PARAMS,
  instructionsPerTick: 1000,
};

const config: InitialStateConfig = {
  worldWidth: 30,
  worldHeight: 30,
  numSets: 20,
  metalPerSet: 10,
  circuitPerSet: 15,
  energyPerSet: 200,
};

// Reference programs
const programC = generateReplicatorProgram(3);
const programD = generateReplicatorProgram(4);

console.log('=== Mutation Analysis Experiment ===');
console.log(`instructionsPerTick: ${params.instructionsPerTick}`);
console.log(`World: ${config.worldWidth}x${config.worldHeight}`);
console.log(`Program C size: ${programC.length} words`);
console.log(`Program D size: ${programD.length} words`);
console.log();

let world = createInitialState(config);
let totalProduced = 0;

// Initial state
report(world, 'Initial');

for (let t = 0; t < TICKS; t++) {
  const result = executeTick(world, params);
  world = result.world;

  for (const event of result.events) {
    if (event.type === 'assembler_completed') {
      totalProduced++;
      console.log(`  [tick ${world.tick}] ${event.id} → ${event.productId}`);
    }
  }

  if ((t + 1) % REPORT_INTERVAL === 0) {
    report(world, `tick ${world.tick}`);
  }
}

console.log();
console.log('=== Final Memory Analysis ===');
analyzeProcessorMemories(world);

// ============================================================

function report(w: World, label: string): void {
  const objs = w.objects;
  const assemblers = objs.filter(o => o.kind === 'assembler') as AssemblerObject[];
  const processors = objs.filter(o => o.kind === 'processor') as ProcessorObject[];
  const materials = objs.filter(o => o.kind === 'material');
  const energy = objs.filter(o => o.kind === 'energy');
  const running = processors.filter(p => p.running);
  const gathering = assemblers.filter(a => a.phase === 'gathering');

  console.log(
    `[${label}] asm:${assemblers.length}(g:${gathering.length}) ` +
    `proc:${processors.length}(r:${running.length}) ` +
    `mat:${materials.length} eng:${energy.length} produced:${totalProduced}`
  );
}

function analyzeProcessorMemories(w: World): void {
  const processors = w.objects.filter(o => o.kind === 'processor') as ProcessorObject[];

  let matchC = 0;
  let matchD = 0;
  let matchNeither = 0;
  let allZero = 0;
  const mutations: { id: string; running: boolean; diffCount: number; closestProgram: string; copiedWords: number; initial: boolean; sampleDiffs: string[] }[] = [];

  // Track initial processor IDs (obj-00003, obj-00004, obj-00033, ...)
  // Initial IDs are <= obj-00600 (20 sets × 30 objects each = 600)
  const isInitial = (id: string) => {
    const num = parseInt(id.replace('obj-', ''), 10);
    return num <= 600;
  };

  for (const proc of processors) {
    const mem = proc.memory;

    const isMatchC = matchesProgram(mem, programC);
    const isMatchD = matchesProgram(mem, programD);
    const isEmpty = mem.every(w => w === 0);

    if (isMatchC) {
      matchC++;
    } else if (isMatchD) {
      matchD++;
    } else if (isEmpty) {
      allZero++;
    } else {
      matchNeither++;
      // Find closest program
      const diffC = countDiffs(mem, programC);
      const diffD = countDiffs(mem, programD);
      const closest = diffC <= diffD ? 'C' : 'D';
      const minDiff = Math.min(diffC, diffD);
      const refProg = closest === 'C' ? programC : programD;

      const sampleDiffs: string[] = [];
      for (let i = 0; i < mem.length && sampleDiffs.length < 10; i++) {
        const expected = i < refProg.length ? refProg[i] : 0;
        if (mem[i] !== expected) {
          sampleDiffs.push(`  [${i}] expected=${expected} actual=${mem[i]}`);
        }
      }

      // Find how many words were correctly copied from beginning
      let copiedWords = 0;
      for (let i = 0; i < refProg.length; i++) {
        if (mem[i] === refProg[i]) copiedWords++;
        else break;
      }

      mutations.push({
        id: proc.id,
        running: proc.running,
        diffCount: minDiff,
        closestProgram: closest,
        copiedWords,
        initial: isInitial(proc.id),
        sampleDiffs,
      });
    }
  }

  const initialProcs = processors.filter(p => isInitial(p.id));
  const newProcs = processors.filter(p => !isInitial(p.id));

  const newMatchC = newProcs.filter(p => matchesProgram(p.memory, programC)).length;
  const newMatchD = newProcs.filter(p => matchesProgram(p.memory, programD)).length;

  console.log(`Total Processors: ${processors.length} (initial: ${initialProcs.length}, new: ${newProcs.length})`);
  console.log(`  Match programC: ${matchC} (initial: ${matchC - newMatchC}, new: ${newMatchC})`);
  console.log(`  Match programD: ${matchD} (initial: ${matchD - newMatchD}, new: ${newMatchD})`);
  console.log(`  All-zero (empty): ${allZero}`);
  console.log(`  Mutated (partial copy): ${matchNeither}`);

  if (mutations.length > 0) {
    console.log();
    console.log('=== Partial Copy Details ===');
    // Histogram of copied words
    const copyHistogram = new Map<number, number>();
    for (const m of mutations) {
      copyHistogram.set(m.copiedWords, (copyHistogram.get(m.copiedWords) ?? 0) + 1);
    }
    console.log('Copied words distribution:');
    for (const [words, count] of [...copyHistogram.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  ${words} words: ${count} processors`);
    }

    console.log();
    console.log('Details (first 5):');
    for (const m of mutations.slice(0, 5)) {
      console.log(`  ${m.id} (running=${m.running}, initial=${m.initial}): copied ${m.copiedWords} words from program${m.closestProgram}`);
    }
  }

  // Also check PC and register state of running processors
  console.log();
  console.log('=== Running Processor States ===');
  const running = processors.filter(p => p.running);
  const pcHistogram = new Map<number, number>();
  for (const p of running) {
    const pc = p.pc;
    pcHistogram.set(pc, (pcHistogram.get(pc) ?? 0) + 1);
  }
  console.log('PC distribution:');
  for (const [pc, count] of [...pcHistogram.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  PC=${pc}: ${count} processors`);
  }
}

function matchesProgram(mem: readonly number[], prog: readonly number[]): boolean {
  for (let i = 0; i < mem.length; i++) {
    const expected = i < prog.length ? prog[i] : 0;
    if (mem[i] !== expected) return false;
  }
  return true;
}

function countDiffs(mem: readonly number[], prog: readonly number[]): number {
  let diffs = 0;
  for (let i = 0; i < mem.length; i++) {
    const expected = i < prog.length ? prog[i] : 0;
    if (mem[i] !== expected) diffs++;
  }
  return diffs;
}
