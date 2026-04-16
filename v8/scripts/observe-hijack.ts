/**
 * v8 hijacker experiment observation script.
 *
 * Runs a world that mixes v2 replicators with one (or more) standalone
 * hijacker Processor(s). Tracks:
 *
 *   - Per-tick PMEM writes (= hijack events): attributed to (actor → target)
 *     by snapshotting every Processor's memory before its individual tick
 *     and diffing immediately after. This works because executeTick runs
 *     processors sequentially in object ID order.
 *
 *   - Final memory classification for each surviving Processor:
 *       - "v2_pristine" — exact bit match to canonical v2 program
 *       - "hij_pristine" — exact bit match to canonical hijacker
 *       - "v2_like"     — has v2 fingerprint (CSCAN_TRIGGER opcode pattern)
 *       - "hij_like"    — has hijacker fingerprint (SCAN_TRIGGER+filter=2 pattern)
 *       - "hybrid"      — both fingerprints present
 *       - "junk"        — neither
 *       - additional flag: "all_zero" = empty memory
 *
 *   - Lineage-by-time: counts of hij-class Processors at each snapshot.
 *
 *   - Mutation distribution: among hij-class Processors, distribution of
 *     edit-distance from canonical hijacker (number of differing words).
 *
 * Usage:
 *   npx tsx scripts/observe-hijack.ts [config.json]
 *
 * Config JSON shape (all fields optional):
 *   {
 *     "ticks": number,
 *     "seed": number,
 *     "label": string,
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
import {
  generateReplicatorProgramV2,
  generateHijackerProgram,
} from '../src/programs.js';
import { executeProcessorTick } from '../src/processor.js';
import { executeAssemblerTick } from '../src/assembler.js';
import { disconnectEdge, replaceObject, getObject } from '../src/world.js';
import {
  ASM_OFF_DISCONNECT_TRIGGER,
  ASM_OFF_DISCONNECT_TARGET_ID,
  PROC_OFF_DISCONNECT_TRIGGER,
  PROC_OFF_DISCONNECT_TARGET_ID,
} from '../src/types.js';
import type {
  AssemblerObject,
  ProcessorObject,
  GroupObject,
  World,
  SimulationEvent,
  TickResult,
} from '../src/types.js';
import { readFileSync } from 'node:fs';

interface Config {
  ticks: number;
  seed?: number;
  label: string;
  initial: InitialStateConfig;
  params: typeof DEFAULT_GAME_PARAMS;
  snapshotEvery?: number;
}

const args = process.argv.slice(2);
const configPath = args[0];

let config: Config = {
  ticks: 10000,
  label: 'hijack default',
  initial: {
    ...DEFAULT_INITIAL_CONFIG,
    worldWidth: 50,
    worldHeight: 50,
    numSets: 5,
    metalPerSet: 20,
    circuitPerSet: 30,
    energyPerSet: 400,
    programVariant: 'v2',
    hijackerCount: 1,
    hijackerOptions: { initialCooldown: 100, postHijackCooldown: 50 },
  },
  params: DEFAULT_GAME_PARAMS,
};

if (configPath) {
  const data = JSON.parse(readFileSync(configPath, 'utf8'));
  config = {
    ticks: data.ticks ?? config.ticks,
    seed: data.seed,
    label: data.label ?? configPath,
    snapshotEvery: data.snapshotEvery,
    initial: { ...config.initial, ...(data.initial ?? {}) },
    params: { ...config.params, ...(data.params ?? {}) },
  };
}

if (config.seed !== undefined) {
  let s = config.seed >>> 0;
  Math.random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const v2Code = generateReplicatorProgramV2({});
const hijackerCode = generateHijackerProgram(config.initial.hijackerOptions ?? {});

let world = createInitialState(config.initial);

// Identify the original hijacker (initial standalone Processor with memory matching hijackerCode)
function findOriginalHijacker(w: World): number | undefined {
  for (const o of w.objects) {
    if (o.kind !== 'processor') continue;
    const p = o as ProcessorObject;
    if (p.groupId !== null) continue;
    let match = true;
    for (let i = 0; i < hijackerCode.length; i++) {
      if (p.memory[i] !== hijackerCode[i]) { match = false; break; }
    }
    if (match) return p.id;
  }
  return undefined;
}
const originalHijackerId = findOriginalHijacker(world);

// =======================================================
// Hijack-attribution executeTick wrapper
// =======================================================

interface HijackEvent {
  tick: number;
  actorId: number;
  targetId: number;
  wordsChanged: number;
}

const hijackEvents: HijackEvent[] = [];

// Mirror of simulation.executeTick that snapshots each proc's memory before/after
// its own tick to attribute PMEM writes.
function executeTickAttributed(currentWorld: World, params: typeof DEFAULT_GAME_PARAMS): TickResult {
  const events: SimulationEvent[] = [];
  const tick = currentWorld.tick;

  // Step 1: Processor execution (ID order)
  const runningProcs = currentWorld.objects
    .filter((o): o is ProcessorObject => o.kind === 'processor' && o.running)
    .sort((a, b) => a.id - b.id);

  for (const proc of runningProcs) {
    // Snapshot all processor memories before this proc's tick
    const snapshot = new Map<number, readonly number[]>();
    for (const o of currentWorld.objects) {
      if (o.kind === 'processor') {
        snapshot.set(o.id, (o as ProcessorObject).memory);
      }
    }

    const result = executeProcessorTick(currentWorld, proc.id, params);
    currentWorld = result.world;

    // Diff: any other processor whose memory changed → was hijacked by proc
    for (const o of currentWorld.objects) {
      if (o.kind !== 'processor') continue;
      if (o.id === proc.id) continue;
      const before = snapshot.get(o.id);
      if (!before) continue;  // new processor created? only assembler creates new procs, not pmem
      const after = (o as ProcessorObject).memory;
      let wordsChanged = 0;
      for (let i = 0; i < after.length; i++) {
        if ((before[i] ?? 0) !== after[i]) wordsChanged++;
      }
      if (wordsChanged > 0) {
        hijackEvents.push({ tick, actorId: proc.id, targetId: o.id, wordsChanged });
      }
    }
  }

  // Step 2: Component action phase (copied verbatim from simulation.ts)
  const procIds = currentWorld.objects
    .filter((o): o is ProcessorObject => o.kind === 'processor')
    .map(p => p.id)
    .sort((a, b) => a - b);
  for (const pid of procIds) {
    const p = getObject(currentWorld, pid) as ProcessorObject | undefined;
    if (!p) continue;
    if (p.operationMemory[PROC_OFF_DISCONNECT_TRIGGER] === 1) {
      const target = p.operationMemory[PROC_OFF_DISCONNECT_TARGET_ID];
      if (target !== 0) {
        const res = disconnectEdge(currentWorld, pid, target);
        currentWorld = res.world;
        if (res.applied) events.push({ type: 'disconnect_applied', actorId: pid, targetId: target });
      }
      const pp = getObject(currentWorld, pid) as ProcessorObject | undefined;
      if (pp) {
        const mem = [...pp.operationMemory];
        mem[PROC_OFF_DISCONNECT_TRIGGER] = 0;
        currentWorld = replaceObject(currentWorld, { ...pp, operationMemory: mem });
      }
    }
  }

  const asmIds = currentWorld.objects
    .filter((o): o is AssemblerObject => o.kind === 'assembler')
    .map(a => a.id)
    .sort((a, b) => a - b);
  for (const aid of asmIds) {
    const a = getObject(currentWorld, aid) as AssemblerObject | undefined;
    if (!a) continue;
    if (a.operationMemory[ASM_OFF_DISCONNECT_TRIGGER] === 1) {
      const target = a.operationMemory[ASM_OFF_DISCONNECT_TARGET_ID];
      if (target !== 0) {
        const res = disconnectEdge(currentWorld, aid, target);
        currentWorld = res.world;
        if (res.applied) events.push({ type: 'disconnect_applied', actorId: aid, targetId: target });
      }
      const aa = getObject(currentWorld, aid) as AssemblerObject | undefined;
      if (aa) {
        const mem = [...aa.operationMemory];
        mem[ASM_OFF_DISCONNECT_TRIGGER] = 0;
        currentWorld = replaceObject(currentWorld, { ...aa, operationMemory: mem });
      }
    }
  }

  // Assembler tick (ASSEMBLE phase) — emits assembler_started / assembler_completed events
  const asmIds2 = currentWorld.objects
    .filter((o): o is AssemblerObject => o.kind === 'assembler')
    .map(a => a.id)
    .sort((a, b) => a - b);
  for (const aid of asmIds2) {
    const a = getObject(currentWorld, aid) as AssemblerObject | undefined;
    if (!a) continue;
    const res = executeAssemblerTick(currentWorld, aid, params);
    currentWorld = res.world;
    for (const ev of res.events) events.push(ev);
  }

  // Step 3+4+5: random movement, boundary correction, tick++ (mirrors simulation.ts exactly)
  const r = params.randomMovementRange;
  const movedObjects = currentWorld.objects.map(obj => {
    if ((obj.kind === 'assembler' || obj.kind === 'processor') && obj.groupId !== null) return obj;
    const angle = Math.random() * 2 * Math.PI;
    const dist = Math.random() * r;
    return {
      ...obj,
      position: {
        x: obj.position.x + Math.cos(angle) * dist,
        y: obj.position.y + Math.sin(angle) * dist,
      },
    };
  });
  currentWorld = { ...currentWorld, objects: movedObjects };
  const boundaryObjects = currentWorld.objects.map(obj => {
    if ((obj.kind === 'assembler' || obj.kind === 'processor') && obj.groupId !== null) return obj;
    let { x, y } = obj.position;
    const margin = 0.1;
    if (x < 0) x = margin;
    if (y < 0) y = margin;
    if (x > currentWorld.width) x = currentWorld.width - margin;
    if (y > currentWorld.height) y = currentWorld.height - margin;
    if (x === obj.position.x && y === obj.position.y) return obj;
    return { ...obj, position: { x, y } };
  });
  currentWorld = { ...currentWorld, objects: boundaryObjects, tick: currentWorld.tick + 1 };

  return { world: currentWorld, events };
}

// =======================================================
// Snapshots
// =======================================================
interface PopSnapshot {
  tick: number;
  procs: number;
  procsRunning: number;
  asm: number;
  groups: number;
  hijLike: number;     // count of procs whose memory currently has hijacker fingerprint
  v2Like: number;
  pristineHij: number;
  pristineV2: number;
  hybrid: number;
  junk: number;
  allZero: number;
}

function fingerprintHijacker(mem: readonly number[]): boolean {
  // Hijacker writes filter=2 to SCAN_FILTER (0x0102) and trigger=1 to SCAN_TRIGGER (0x0101).
  // Distinctive 2-word pattern: LI r2, 0x0102 = encodeW(LI, 2, 0, 0x0102) = [(32<<10)|(2<<7), 0x0102]
  // = [0x8100, 0x0102]. Search for this 2-word pair.
  // Also LI r2, 0x0101 (SCAN_TRIGGER): [0x8100, 0x0101].
  // SCAN_TRIGGER at 0x0101 is rare in v2 (which uses 0x0124).
  let foundFilter = false, foundTrigger = false;
  for (let i = 0; i < mem.length - 1; i++) {
    if (mem[i] === 0x8100) {
      if (mem[i + 1] === 0x0102) foundFilter = true;
      if (mem[i + 1] === 0x0101) foundTrigger = true;
    }
  }
  return foundFilter && foundTrigger;
}

function fingerprintV2(mem: readonly number[]): boolean {
  // v2 writes to CSCAN_FILTER (0x0125) and CSCAN_TRIGGER (0x0124).
  // Pattern: LI r2, 0x0125 = [0x8100, 0x0125]; LI r2, 0x0124 = [0x8100, 0x0124].
  let foundFilter = false, foundTrigger = false;
  for (let i = 0; i < mem.length - 1; i++) {
    if (mem[i] === 0x8100) {
      if (mem[i + 1] === 0x0125) foundFilter = true;
      if (mem[i + 1] === 0x0124) foundTrigger = true;
    }
  }
  return foundFilter && foundTrigger;
}

function isPristineMatch(mem: readonly number[], canon: readonly number[]): boolean {
  for (let i = 0; i < canon.length; i++) {
    if ((mem[i] ?? 0) !== canon[i]) return false;
  }
  for (let i = canon.length; i < mem.length; i++) {
    if ((mem[i] ?? 0) !== 0) return false;
  }
  return true;
}

function isAllZero(mem: readonly number[]): boolean {
  for (let i = 0; i < mem.length; i++) if (mem[i] !== 0) return false;
  return true;
}

function classify(mem: readonly number[]): {
  pristineV2: boolean;
  pristineHij: boolean;
  v2Like: boolean;
  hijLike: boolean;
  allZero: boolean;
} {
  return {
    pristineV2: isPristineMatch(mem, v2Code),
    pristineHij: isPristineMatch(mem, hijackerCode),
    v2Like: fingerprintV2(mem),
    hijLike: fingerprintHijacker(mem),
    allZero: isAllZero(mem),
  };
}

function snapshotPop(w: World): PopSnapshot {
  let procs = 0, procsRunning = 0, asm = 0, groups = 0;
  let hijLike = 0, v2Like = 0, pristineHij = 0, pristineV2 = 0, hybrid = 0, junk = 0, allZero = 0;
  for (const o of w.objects) {
    if (o.kind === 'group') groups++;
    else if (o.kind === 'assembler') asm++;
    else if (o.kind === 'processor') {
      procs++;
      const p = o as ProcessorObject;
      if (p.running) procsRunning++;
      const c = classify(p.memory);
      if (c.allZero) { allZero++; continue; }
      if (c.pristineHij) pristineHij++;
      if (c.pristineV2) pristineV2++;
      if (c.hijLike) hijLike++;
      if (c.v2Like) v2Like++;
      if (c.hijLike && c.v2Like) hybrid++;
      if (!c.hijLike && !c.v2Like && !c.allZero) junk++;
    }
  }
  return { tick: w.tick, procs, procsRunning, asm, groups, hijLike, v2Like, pristineHij, pristineV2, hybrid, junk, allZero };
}

// =======================================================
// Run
// =======================================================
const snapshotEvery = config.snapshotEvery ?? Math.max(1, Math.floor(config.ticks / 50));
const popSnapshots: PopSnapshot[] = [];
popSnapshots.push(snapshotPop(world));

const eventCounters = {
  assembler_started: 0,
  assembler_completed: 0,
  asm_completed_by_actor: new Map<number, number>(),  // actorId → count (assembler that ran)
  disconnect: 0,
};

// Track which actors performed any hijack
const hijackActorsCount = new Map<number, number>();
const hijackTargets = new Map<number, number>();   // targetId → number of times overwritten
const firstHijackTick = new Map<number, number>(); // first time each actor hijacked

for (let t = 0; t < config.ticks; t++) {
  const result = executeTickAttributed(world, config.params);
  world = result.world;
  for (const ev of result.events) {
    if (ev.type === 'assembler_started') eventCounters.assembler_started++;
    else if (ev.type === 'assembler_completed') {
      eventCounters.assembler_completed++;
      eventCounters.asm_completed_by_actor.set(
        ev.id,
        (eventCounters.asm_completed_by_actor.get(ev.id) ?? 0) + 1,
      );
    } else if (ev.type === 'disconnect_applied') eventCounters.disconnect++;
  }

  // Tally hijack attributions captured in hijackEvents during this tick
  // (they were appended above but we need to bucket them at tick boundary)
  for (let i = hijackEvents.length - 1; i >= 0; i--) {
    const e = hijackEvents[i];
    if (e.tick !== t) break;
    hijackActorsCount.set(e.actorId, (hijackActorsCount.get(e.actorId) ?? 0) + 1);
    hijackTargets.set(e.targetId, (hijackTargets.get(e.targetId) ?? 0) + 1);
    if (!firstHijackTick.has(e.actorId)) firstHijackTick.set(e.actorId, t);
  }

  if ((t + 1) % snapshotEvery === 0 || t === config.ticks - 1) {
    popSnapshots.push(snapshotPop(world));
  }
}

// =======================================================
// Final analysis
// =======================================================

const finalProcs = world.objects.filter((o): o is ProcessorObject => o.kind === 'processor');
const finalAsm = world.objects.filter((o): o is AssemblerObject => o.kind === 'assembler');
const finalGroups = world.objects.filter((o): o is GroupObject => o.kind === 'group');

interface ProcRecord {
  id: number;
  groupId: number | null;
  running: boolean;
  pc: number;
  pristineV2: boolean;
  pristineHij: boolean;
  v2Like: boolean;
  hijLike: boolean;
  allZero: boolean;
  diffsVsHij: number;
  diffsVsV2: number;
  hijackEventsAsActor: number;
  timesOverwritten: number;
}

const procRecords: ProcRecord[] = finalProcs.map(p => {
  const c = classify(p.memory);
  let diffsVsHij = 0, diffsVsV2 = 0;
  for (let i = 0; i < p.memory.length; i++) {
    const w = p.memory[i] ?? 0;
    if (w !== (hijackerCode[i] ?? 0)) diffsVsHij++;
    if (w !== (v2Code[i] ?? 0)) diffsVsV2++;
  }
  return {
    id: p.id,
    groupId: p.groupId,
    running: p.running,
    pc: p.pc,
    pristineV2: c.pristineV2,
    pristineHij: c.pristineHij,
    v2Like: c.v2Like,
    hijLike: c.hijLike,
    allZero: c.allZero,
    diffsVsHij,
    diffsVsV2,
    hijackEventsAsActor: hijackActorsCount.get(p.id) ?? 0,
    timesOverwritten: hijackTargets.get(p.id) ?? 0,
  };
});

const totalHijackEvents = hijackEvents.length;
const uniqueActors = new Set(hijackEvents.map(e => e.actorId));
const uniqueTargets = new Set(hijackEvents.map(e => e.targetId));

// =======================================================
// Output
// =======================================================
const log = (s: string) => console.log(s);

log(`# v8 Hijacker Observation: ${config.label}`);
log('');
log(`## Config`);
log(`- ticks: ${config.ticks}`);
log(`- world: ${config.initial.worldWidth}x${config.initial.worldHeight}`);
log(`- numSets (v2 pairs): ${config.initial.numSets}`);
log(`- hijackerCount: ${config.initial.hijackerCount ?? 0}`);
log(`- hijackerOptions: ${JSON.stringify(config.initial.hijackerOptions)}`);
log(`- materials: metal=${config.initial.metalPerSet} circuit=${config.initial.circuitPerSet} energy=${config.initial.energyPerSet}`);
log(`- proximityRange: ${config.params.proximityRange} randomMove: ${config.params.randomMovementRange}`);
log(`- seed: ${config.seed ?? 'none'}`);
log(`- v2 program length: ${v2Code.length} words`);
log(`- hijacker program length: ${hijackerCode.length} words`);
log(`- original hijacker id: ${originalHijackerId ?? 'NOT FOUND'}`);
log('');

const final = popSnapshots[popSnapshots.length - 1];
log(`## Final Population (tick ${final.tick})`);
log(`- Processors: ${final.procs} (running ${final.procsRunning})`);
log(`- Assemblers: ${final.asm}`);
log(`- Groups: ${final.groups}`);
log(`- Pristine v2:        ${final.pristineV2}`);
log(`- Pristine hijacker:  ${final.pristineHij}`);
log(`- v2-like (fingerprint): ${final.v2Like}`);
log(`- hij-like (fingerprint): ${final.hijLike}`);
log(`- hybrid (both):      ${final.hybrid}`);
log(`- junk (neither):     ${final.junk}`);
log(`- all-zero memory:    ${final.allZero}`);
log('');

log(`## Hijack events`);
log(`- total PMEM-write events (per actor-target-tick triple): ${totalHijackEvents}`);
log(`- unique hijack actors: ${uniqueActors.size}`);
log(`- unique hijack targets (procs ever overwritten): ${uniqueTargets.size}`);
log(`- hijack actor IDs (top 10 by event count):`);
const actorList = [...hijackActorsCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [aid, cnt] of actorList) {
  const isOriginal = aid === originalHijackerId ? ' (ORIGINAL)' : '';
  log(`    - id=${aid}: ${cnt} events${isOriginal}`);
}
log('');

log(`## Self-replication still happening?`);
log(`- assembler_started: ${eventCounters.assembler_started}`);
log(`- assembler_completed: ${eventCounters.assembler_completed}`);
log(`- disconnect_applied: ${eventCounters.disconnect}`);
log(`- assembler_completed by actor (top 10):`);
const asmActors = [...eventCounters.asm_completed_by_actor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [aid, cnt] of asmActors) {
  log(`    - assembler id=${aid}: ${cnt} completed`);
}
log('');

log(`## Memory diff distribution (vs canonical hijacker, ${hijackerCode.length} words)`);
const hijLikeRecords = procRecords.filter(r => r.hijLike);
if (hijLikeRecords.length > 0) {
  const diffs = hijLikeRecords.map(r => r.diffsVsHij).sort((a, b) => a - b);
  const min = diffs[0];
  const max = diffs[diffs.length - 1];
  const med = diffs[Math.floor(diffs.length / 2)];
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const exact = diffs.filter(d => d === 0).length;
  log(`- hijacker-class procs: ${hijLikeRecords.length}`);
  log(`- diffs (words): min=${min} median=${med} mean=${mean.toFixed(1)} max=${max}`);
  log(`- pristine (exact match): ${exact}`);
}
log('');

log(`## Memory diff distribution (vs canonical v2, ${v2Code.length} words)`);
const v2LikeRecords = procRecords.filter(r => r.v2Like);
if (v2LikeRecords.length > 0) {
  const diffs = v2LikeRecords.map(r => r.diffsVsV2).sort((a, b) => a - b);
  const min = diffs[0];
  const max = diffs[diffs.length - 1];
  const med = diffs[Math.floor(diffs.length / 2)];
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const exact = diffs.filter(d => d === 0).length;
  log(`- v2-class procs: ${v2LikeRecords.length}`);
  log(`- diffs (words): min=${min} median=${med} mean=${mean.toFixed(1)} max=${max}`);
  log(`- pristine (exact match): ${exact}`);
}
log('');

log(`## Population over time (every ${snapshotEvery} ticks)`);
log(`tick | proc(R) | asm | grp | v2px/hjpx | v2fp/hjfp | hyb | junk | zero`);
for (const s of popSnapshots) {
  log(
    `${String(s.tick).padStart(5)} | ${String(s.procs).padStart(3)}(${String(s.procsRunning).padStart(2)}) | ` +
    `${String(s.asm).padStart(3)} | ${String(s.groups).padStart(3)} | ` +
    `${String(s.pristineV2).padStart(3)}/${String(s.pristineHij).padStart(3)} | ` +
    `${String(s.v2Like).padStart(3)}/${String(s.hijLike).padStart(3)} | ` +
    `${String(s.hybrid).padStart(3)} | ${String(s.junk).padStart(4)} | ${String(s.allZero).padStart(4)}`
  );
}
log('');

log(`## Per-Processor records (final, sorted by id)`);
log(`  id | grp | run | pc   | class           | diffsHij | diffsV2 | actEv | overwr`);
for (const r of procRecords.sort((a, b) => a.id - b.id)) {
  let cls = 'junk';
  if (r.allZero) cls = 'all-zero';
  else if (r.pristineHij) cls = 'pristineHij';
  else if (r.pristineV2) cls = 'pristineV2';
  else if (r.hijLike && r.v2Like) cls = 'hybrid';
  else if (r.hijLike) cls = 'hijLike';
  else if (r.v2Like) cls = 'v2Like';
  log(
    `${String(r.id).padStart(4)} | ${String(r.groupId ?? '-').padStart(3)} | ` +
    `${r.running ? 'Y' : 'n'} | ${String(r.pc).padStart(4)} | ` +
    `${cls.padEnd(15)} | ${String(r.diffsVsHij).padStart(8)} | ${String(r.diffsVsV2).padStart(7)} | ` +
    `${String(r.hijackEventsAsActor).padStart(5)} | ${String(r.timesOverwritten).padStart(6)}`
  );
}
