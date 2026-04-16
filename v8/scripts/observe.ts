/**
 * v8 observation script — runs the simulation and gathers detailed
 * population/replication statistics for tuning analysis.
 *
 * Usage: npx tsx scripts/observe.ts [config.json]
 *
 * Config JSON shape (all fields optional):
 *   {
 *     "ticks": number,
 *     "seed": number,                // used for Math.random shimming if provided
 *     "label": string,                // included in output
 *     "initial": Partial<InitialStateConfig>,
 *     "params": Partial<GameParams>
 *   }
 */

import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import {
  createInitialState,
  DEFAULT_INITIAL_CONFIG,
  type InitialStateConfig,
} from '../src/initial-state.js';
import { executeTick } from '../src/simulation.js';
import type {
  AssemblerObject,
  ProcessorObject,
  GroupObject,
  World,
  SimulationEvent,
} from '../src/types.js';
import { readFileSync } from 'node:fs';

interface Config {
  ticks: number;
  seed?: number;
  label: string;
  initial: InitialStateConfig;
  params: typeof DEFAULT_GAME_PARAMS;
}

const args = process.argv.slice(2);
const configPath = args[0];

// Default config
let config: Config = {
  ticks: 1000,
  label: 'default',
  initial: DEFAULT_INITIAL_CONFIG,
  params: DEFAULT_GAME_PARAMS,
};

if (configPath) {
  const data = JSON.parse(readFileSync(configPath, 'utf8'));
  config = {
    ticks: data.ticks ?? config.ticks,
    seed: data.seed,
    label: data.label ?? configPath,
    initial: { ...DEFAULT_INITIAL_CONFIG, ...(data.initial ?? {}) },
    params: { ...DEFAULT_GAME_PARAMS, ...(data.params ?? {}) },
  };
}

// Optional deterministic Math.random
if (config.seed !== undefined) {
  let s = config.seed >>> 0;
  Math.random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

let world = createInitialState(config.initial);
const initialProgram = (() => {
  // Capture program from the first processor in the initial world
  const p = world.objects.find(o => o.kind === 'processor') as ProcessorObject | undefined;
  return p ? [...p.memory] : [];
})();

interface Snapshot {
  tick: number;
  groups: number;
  asm: number;
  asmGathering: number;
  asmAssembling: number;
  proc: number;
  procRunning: number;
  materials: number;
  energy: number;
  events: { assembleCompleted: number; disconnect: number };
}

const snapshots: Snapshot[] = [];
const events = {
  assembleStarted: 0,
  assembleCompleted: 0,
  assembleCompletedR3: 0,
  assembleCompletedR4: 0,
  disconnect: 0,
  groupSplit: 0,
  groupDissolved: 0,
};

// Track which processors completed at least one disconnect cycle
const successfulParents = new Set<number>();
// Track processor PC samples to detect stuck patterns
const pcHistogram = new Map<number, number>();
// Track max cycle depth (which parent produced which child)
let peakRunningProcs = 0;
let peakGroups = 0;

function snapshot(tick: number): Snapshot {
  let groups = 0, asm = 0, asmG = 0, asmA = 0, proc = 0, procR = 0, mat = 0, eng = 0;
  for (const o of world.objects) {
    if (o.kind === 'group') groups++;
    else if (o.kind === 'assembler') {
      asm++;
      const a = o as AssemblerObject;
      if (a.phase === 'gathering') asmG++;
      if (a.phase === 'assembling') asmA++;
    } else if (o.kind === 'processor') {
      proc++;
      const p = o as ProcessorObject;
      if (p.running) procR++;
    } else if (o.kind === 'material') mat++;
    else if (o.kind === 'energy') eng++;
  }
  return {
    tick, groups, asm, asmGathering: asmG, asmAssembling: asmA,
    proc, procRunning: procR, materials: mat, energy: eng,
    events: { assembleCompleted: 0, disconnect: 0 },
  };
}

function snapshotInterval(): number {
  return Math.max(1, Math.floor(config.ticks / 50));
}

const initialSnap = snapshot(0);
snapshots.push(initialSnap);

const initialAsm = initialSnap.asm;
const initialProc = initialSnap.proc;

let tickEvents = { assembleCompleted: 0, disconnect: 0 };

for (let t = 0; t < config.ticks; t++) {
  const result = executeTick(world, config.params);
  world = result.world;

  for (const ev of result.events as readonly SimulationEvent[]) {
    if (ev.type === 'assembler_started') {
      events.assembleStarted++;
    } else if (ev.type === 'assembler_completed') {
      events.assembleCompleted++;
      tickEvents.assembleCompleted++;
      // Classify by product kind: look up product in world
      const prod = world.objects.find(o => o.id === ev.productId);
      if (prod?.kind === 'processor') events.assembleCompletedR4++;
      else if (prod?.kind === 'assembler') events.assembleCompletedR3++;
    } else if (ev.type === 'disconnect_applied') {
      events.disconnect++;
      tickEvents.disconnect++;
      successfulParents.add(ev.actorId);
    } else if (ev.type === 'group_split') {
      events.groupSplit++;
    } else if (ev.type === 'group_dissolved') {
      events.groupDissolved++;
    }
  }

  // Track peaks
  let runningCount = 0;
  let groupCount = 0;
  for (const o of world.objects) {
    if (o.kind === 'processor' && (o as ProcessorObject).running) runningCount++;
    else if (o.kind === 'group') groupCount++;
  }
  if (runningCount > peakRunningProcs) peakRunningProcs = runningCount;
  if (groupCount > peakGroups) peakGroups = groupCount;

  // Sample running processors' PCs to detect "stuck in wait loop" patterns
  if ((t & 0xFF) === 0) {
    for (const o of world.objects) {
      if (o.kind === 'processor' && (o as ProcessorObject).running) {
        const pc = (o as ProcessorObject).pc;
        pcHistogram.set(pc, (pcHistogram.get(pc) ?? 0) + 1);
      }
    }
  }

  if ((t + 1) % snapshotInterval() === 0 || t === config.ticks - 1) {
    const s = snapshot(world.tick);
    s.events = { ...tickEvents };
    snapshots.push(s);
    tickEvents = { assembleCompleted: 0, disconnect: 0 };
  }
}

// ============================================================
// Analyze final state
// ============================================================
const finalGroups = world.objects.filter(o => o.kind === 'group') as GroupObject[];
const finalAsm = world.objects.filter(o => o.kind === 'assembler') as AssemblerObject[];
const finalProc = world.objects.filter(o => o.kind === 'processor') as ProcessorObject[];

// Group composition histogram (member count → count of groups with that count)
const groupSizeHist = new Map<number, number>();
for (const g of finalGroups) {
  const n = g.memberIds.length;
  groupSizeHist.set(n, (groupSizeHist.get(n) ?? 0) + 1);
}

// Memory difference: for each non-initial processor, count words differing from initial program
let progLen = initialProgram.length;
const memoryDiffs: number[] = [];
const memoryDiffPositions: number[] = [];  // which positions differ across all child procs
const positionDiffCount = new Array<number>(progLen).fill(0);
let childProcCount = 0;
for (const p of finalProc) {
  if (p.id <= initialProc) continue;  // skip parents (they have id ≤ initial count); this approximation is rough
  childProcCount++;
  let diffs = 0;
  for (let i = 0; i < progLen; i++) {
    if ((p.memory[i] ?? 0) !== (initialProgram[i] ?? 0)) {
      diffs++;
      positionDiffCount[i]++;
    }
  }
  memoryDiffs.push(diffs);
}
memoryDiffs.sort((a, b) => a - b);

// Find top diff positions
const topDiffPositions: { pos: number; count: number }[] = [];
for (let i = 0; i < progLen; i++) {
  if (positionDiffCount[i] > 0) topDiffPositions.push({ pos: i, count: positionDiffCount[i] });
}
topDiffPositions.sort((a, b) => b.count - a.count);

// Stuck PC analysis
const sortedPCs = [...pcHistogram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

// ============================================================
// Output
// ============================================================
console.log(`# v8 Observation: ${config.label}`);
console.log(``);
console.log(`## Config`);
console.log(`- ticks: ${config.ticks}`);
console.log(`- world: ${config.initial.worldWidth}x${config.initial.worldHeight}`);
console.log(`- numSets: ${config.initial.numSets}`);
console.log(`- metalPerSet: ${config.initial.metalPerSet}, circuitPerSet: ${config.initial.circuitPerSet}, energyPerSet: ${config.initial.energyPerSet}`);
console.log(`- proximityRange: ${config.params.proximityRange}, randomMovementRange: ${config.params.randomMovementRange}`);
console.log(`- instructionsPerTick: ${config.params.instructionsPerTick}`);
console.log(`- seed: ${config.seed ?? 'none'}`);
console.log(``);

console.log(`## Initial → Final`);
console.log(`- Groups: ${snapshots[0].groups} → ${finalGroups.length}`);
console.log(`- Assemblers: ${initialAsm} → ${finalAsm.length} (Δ ${finalAsm.length - initialAsm})`);
console.log(`- Processors: ${initialProc} → ${finalProc.length} (Δ ${finalProc.length - initialProc})`);
console.log(``);

console.log(`## Events`);
console.log(`- assembler_started: ${events.assembleStarted}`);
console.log(`- assembler_completed: ${events.assembleCompleted} (R3/A:${events.assembleCompletedR3}, R4/P:${events.assembleCompletedR4})`);
console.log(`- disconnect_applied: ${events.disconnect}`);
console.log(`- successful disconnect actors (unique): ${successfulParents.size}`);
console.log(`- peak running procs: ${peakRunningProcs}, peak groups: ${peakGroups}`);
console.log(``);

// Count freestanding components (no group) & isolated groups
let freestandingAsm = 0, freestandingProc = 0, freestandingRunning = 0;
for (const o of world.objects) {
  if (o.kind === 'assembler' && (o as AssemblerObject).groupId === null) freestandingAsm++;
  if (o.kind === 'processor' && (o as ProcessorObject).groupId === null) {
    freestandingProc++;
    if ((o as ProcessorObject).running) freestandingRunning++;
  }
}
console.log(`## Freestanding (non-grouped) components (final)`);
console.log(`- Assemblers: ${freestandingAsm}, Processors: ${freestandingProc} (running: ${freestandingRunning})`);
console.log(``);

// Group member type composition
let g2AP = 0, gOther = 0;
for (const g of finalGroups) {
  if (g.memberIds.length === 2) {
    const kinds = g.memberIds.map(id => (world.objects.find(o => o.id === id) as any)?.kind ?? '?').sort();
    if (kinds[0] === 'assembler' && kinds[1] === 'processor') g2AP++;
    else gOther++;
  } else gOther++;
}
console.log(`## Group composition (final)`);
console.log(`- {Assembler, Processor} pairs: ${g2AP}`);
console.log(`- other: ${gOther}`);
console.log(``);

console.log(`## Group size histogram (final)`);
const sizes = [...groupSizeHist.entries()].sort((a, b) => a[0] - b[0]);
for (const [size, count] of sizes) {
  console.log(`- ${size} members: ${count} groups`);
}
console.log(``);

console.log(`## Memory diff (child processors vs initial program, ${progLen} words)`);
console.log(`- child processors counted: ${childProcCount}`);
if (memoryDiffs.length > 0) {
  const min = memoryDiffs[0];
  const max = memoryDiffs[memoryDiffs.length - 1];
  const med = memoryDiffs[Math.floor(memoryDiffs.length / 2)];
  const mean = memoryDiffs.reduce((a, b) => a + b, 0) / memoryDiffs.length;
  const zero = memoryDiffs.filter(d => d === 0).length;
  console.log(`- diffs (words): min=${min} median=${med} mean=${mean.toFixed(1)} max=${max}`);
  console.log(`- perfect copies: ${zero}/${memoryDiffs.length}`);
  console.log(`- top 10 diff positions:`);
  for (const { pos, count } of topDiffPositions.slice(0, 10)) {
    console.log(`  - mem[${pos}]: ${count}/${childProcCount} differ`);
  }
}
console.log(``);

console.log(`## Top PC sample positions (running procs)`);
for (const [pc, count] of sortedPCs) {
  console.log(`- pc=${pc}: ${count}`);
}
console.log(``);

console.log(`## Snapshots (every ${snapshotInterval()} ticks)`);
console.log(`tick | groups | asm(g/a) | proc(r) | mat | events(asmCpl/disc)`);
for (const s of snapshots) {
  console.log(
    `${String(s.tick).padStart(5)} | ${String(s.groups).padStart(6)} | ` +
    `${String(s.asm).padStart(3)}(${s.asmGathering}/${s.asmAssembling}) | ` +
    `${String(s.proc).padStart(3)}(${s.procRunning}) | ${String(s.materials).padStart(4)} | ` +
    `${s.events.assembleCompleted}/${s.events.disconnect}`
  );
}
