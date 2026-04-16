/**
 * Run a sweep of experiments and print a compact per-row summary table.
 *
 * Usage: npx tsx scripts/run-sweep.ts
 */
import { DEFAULT_GAME_PARAMS, type GameParams } from '../src/params.js';
import { createInitialState, DEFAULT_INITIAL_CONFIG, type InitialStateConfig } from '../src/initial-state.js';
import { executeTick } from '../src/simulation.js';
import type { ProcessorObject, GroupObject, AssemblerObject, SimulationEvent } from '../src/types.js';

interface Experiment {
  label: string;
  ticks: number;
  seed: number;
  initial?: Partial<InitialStateConfig>;
  params?: Partial<GameParams>;
}

const experiments: Experiment[] = [
  // Seed variance on baseline v1
  { label: 'v1 seed=1', ticks: 1000, seed: 1 },
  { label: 'v1 seed=2', ticks: 1000, seed: 2 },
  { label: 'v1 seed=3', ticks: 1000, seed: 3 },
  // v1 longer
  { label: 'v1 seed=1 3k', ticks: 3000, seed: 1 },
  // v2 fixed
  { label: 'v2 seed=1', ticks: 1000, seed: 1, initial: { programVariant: 'v2' } },
  { label: 'v2 seed=2', ticks: 1000, seed: 2, initial: { programVariant: 'v2' } },
  { label: 'v2 seed=3', ticks: 1000, seed: 3, initial: { programVariant: 'v2' } },
  { label: 'v2 seed=1 3k', ticks: 3000, seed: 1, initial: { programVariant: 'v2' } },
  // v2 looping
  { label: 'v2 loop seed=1', ticks: 1000, seed: 1, initial: { programVariant: 'v2', programLoop: true } },
  { label: 'v2 loop seed=2 3k', ticks: 3000, seed: 2, initial: { programVariant: 'v2', programLoop: true } },
  // World density
  { label: 'v2 world50', ticks: 1000, seed: 1, initial: { programVariant: 'v2', worldWidth: 50, worldHeight: 50 } },
  { label: 'v2 world30', ticks: 1000, seed: 1, initial: { programVariant: 'v2', worldWidth: 30, worldHeight: 30 } },
  // Resource abundance
  { label: 'v2 mat×2', ticks: 1000, seed: 1, initial: { programVariant: 'v2', metalPerSet: 20, circuitPerSet: 30, energyPerSet: 400 } },
  { label: 'v2 mat×4', ticks: 1000, seed: 1, initial: { programVariant: 'v2', metalPerSet: 40, circuitPerSet: 60, energyPerSet: 800 } },
  { label: 'v2 mat×4 3k', ticks: 3000, seed: 1, initial: { programVariant: 'v2', metalPerSet: 40, circuitPerSet: 60, energyPerSet: 800 } },
  // instructionsPerTick sweep
  { label: 'v2 ipt=5000', ticks: 1000, seed: 1, initial: { programVariant: 'v2' }, params: { instructionsPerTick: 5000 } },
  { label: 'v2 ipt=20000', ticks: 1000, seed: 1, initial: { programVariant: 'v2' }, params: { instructionsPerTick: 20000 } },
  // Movement
  { label: 'v2 move=2.0', ticks: 1000, seed: 1, initial: { programVariant: 'v2' }, params: { randomMovementRange: 2.0 } },
  // Partial copy (drift-out)
  { label: 'v2 copy=512', ticks: 1000, seed: 1, initial: { programVariant: 'v2', programOptions: { copySize: 512 } } },
  { label: 'v2 copy=256', ticks: 1000, seed: 1, initial: { programVariant: 'v2', programOptions: { copySize: 256 } } },
  // Looping + abundant + long
  { label: 'v2 loop mat×4 3k', ticks: 3000, seed: 1, initial: { programVariant: 'v2', programLoop: true, metalPerSet: 40, circuitPerSet: 60, energyPerSet: 800 } },
];

interface Result {
  label: string;
  ticks: number;
  groups0: number;
  groupsF: number;
  asmF: number;
  procF: number;
  asmC: number;
  disc: number;
  freestP: number;
  freestA: number;
  peakGroups: number;
  peakRun: number;
  childProcs: number;
  emptyChildren: number;       // pc=0, running=false, mem all zero → never copied
  copiedChildren: number;      // received at least partial copy
  mutatedCopied: number;       // copied and differs from source
  meanDiffCopied: number;
}

function runOne(exp: Experiment): Result {
  let s = exp.seed >>> 0;
  Math.random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };

  const initialCfg = { ...DEFAULT_INITIAL_CONFIG, ...(exp.initial ?? {}) };
  const params: GameParams = { ...DEFAULT_GAME_PARAMS, ...(exp.params ?? {}) };
  let world = createInitialState(initialCfg);

  const initialProcs = world.objects.filter(o => o.kind === 'processor') as ProcessorObject[];
  const initialProgLen = initialProcs[0]?.memory.length ?? 0;
  const initialProg = initialProcs[0]?.memory ? [...initialProcs[0].memory] : [];
  const initialProcIds = new Set(initialProcs.map(p => p.id));
  const groups0 = world.objects.filter(o => o.kind === 'group').length;

  let asmC = 0, disc = 0;
  let peakGroups = groups0, peakRun = initialProcs.length;

  for (let t = 0; t < exp.ticks; t++) {
    const r = executeTick(world, params);
    world = r.world;
    for (const ev of r.events as readonly SimulationEvent[]) {
      if (ev.type === 'assembler_completed') asmC++;
      else if (ev.type === 'disconnect_applied') disc++;
    }
    const pg = world.objects.filter(o => o.kind === 'group').length;
    if (pg > peakGroups) peakGroups = pg;
    const pr = world.objects.filter(o => o.kind === 'processor' && (o as ProcessorObject).running).length;
    if (pr > peakRun) peakRun = pr;
  }

  const finalGroups = world.objects.filter(o => o.kind === 'group') as GroupObject[];
  const finalAsm = world.objects.filter(o => o.kind === 'assembler') as AssemblerObject[];
  const finalProc = world.objects.filter(o => o.kind === 'processor') as ProcessorObject[];
  const freestA = finalAsm.filter(a => a.groupId === null).length;
  const freestP = finalProc.filter(p => p.groupId === null).length;

  // Mutation stats over non-initial processors
  const childProcs: ProcessorObject[] = finalProc.filter(p => !initialProcIds.has(p.id));
  let emptyCount = 0;
  let copiedCount = 0;
  let mutatedCopiedCount = 0;
  const copiedDiffs: number[] = [];
  for (const p of childProcs) {
    const allZero = p.memory.every(w => w === 0);
    if (allZero) { emptyCount++; continue; }
    copiedCount++;
    let d = 0;
    for (let i = 0; i < initialProgLen; i++) {
      if ((p.memory[i] ?? 0) !== (initialProg[i] ?? 0)) d++;
    }
    copiedDiffs.push(d);
    if (d > 0) mutatedCopiedCount++;
  }
  const meanDiffCopied = copiedDiffs.length > 0 ? copiedDiffs.reduce((a, b) => a + b, 0) / copiedDiffs.length : 0;

  return {
    label: exp.label, ticks: exp.ticks, groups0, groupsF: finalGroups.length,
    asmF: finalAsm.length, procF: finalProc.length, asmC, disc,
    freestP, freestA, peakGroups, peakRun,
    childProcs: childProcs.length, emptyChildren: emptyCount,
    copiedChildren: copiedCount, mutatedCopied: mutatedCopiedCount,
    meanDiffCopied,
  };
}

const results: Result[] = [];
for (const e of experiments) {
  process.stderr.write(`running: ${e.label}...\n`);
  results.push(runOne(e));
}

// Print markdown table
console.log('| label | ticks | groups | asm | proc | asmCpl | disc | freestA/P | childProc | empty | copied | mutCopied |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of results) {
  console.log(
    `| ${r.label} | ${r.ticks} | ${r.groups0}→${r.groupsF} | ${r.asmF} | ${r.procF} | ${r.asmC} | ${r.disc} | ${r.freestA}/${r.freestP} | ${r.childProcs} | ${r.emptyChildren} | ${r.copiedChildren} | ${r.mutatedCopied} |`
  );
}
