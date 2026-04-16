/**
 * Inspect why certain components end up freestanding (not in a group).
 * Runs the baseline and dumps info about freestanding components.
 */
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createInitialState, DEFAULT_INITIAL_CONFIG } from '../src/initial-state.js';
import { executeTick } from '../src/simulation.js';
import type { ProcessorObject, AssemblerObject, GroupObject, SimulationEvent } from '../src/types.js';

// Deterministic seed
let s = 42 >>> 0;
Math.random = () => {
  s = (s * 1664525 + 1013904223) >>> 0;
  return s / 0x100000000;
};

let world = createInitialState(DEFAULT_INITIAL_CONFIG);
const TICKS = 1000;

// Capture each event with tick
interface EventLog {
  tick: number;
  ev: SimulationEvent;
}
const log: EventLog[] = [];

for (let t = 0; t < TICKS; t++) {
  const r = executeTick(world, DEFAULT_GAME_PARAMS);
  world = r.world;
  for (const ev of r.events) log.push({ tick: t, ev });
}

console.log(`tick after ${TICKS}: ${world.tick}`);

// Freestanding processors
const procs = world.objects.filter(o => o.kind === 'processor') as ProcessorObject[];
const asms = world.objects.filter(o => o.kind === 'assembler') as AssemblerObject[];
const groups = world.objects.filter(o => o.kind === 'group') as GroupObject[];

console.log(`\nGroups: ${groups.length}, Assemblers: ${asms.length}, Processors: ${procs.length}`);
const freeP = procs.filter(p => p.groupId === null);
const freeA = asms.filter(a => a.groupId === null);
console.log(`Freestanding P: ${freeP.length}, A: ${freeA.length}`);

// For each freestanding processor, find their first disconnect as an actor or target
for (const fp of freeP.slice(0, 6)) {
  console.log(`\n--- Freestanding Proc id=${fp.id} pc=${fp.pc} running=${fp.running} ---`);
  console.log(`  pos=(${fp.position.x.toFixed(1)},${fp.position.y.toFixed(1)})`);
  // Find disconnect events involving this id
  const relevantEvents = log.filter(l =>
    l.ev.type === 'disconnect_applied' &&
    (l.ev.actorId === fp.id || l.ev.targetId === fp.id)
  );
  console.log(`  disconnect events involving: ${relevantEvents.length}`);
  for (const r of relevantEvents.slice(0, 5)) {
    console.log(`    tick=${r.tick}: disconnect_applied actor=${(r.ev as any).actorId} target=${(r.ev as any).targetId}`);
  }
}

// Count disconnect "actor-target" patterns
const dcPatterns = new Map<string, number>();
for (const l of log) {
  if (l.ev.type === 'disconnect_applied') {
    const ev = l.ev;
    const actor = world.objects.find(o => o.id === ev.actorId);
    const target = world.objects.find(o => o.id === ev.targetId);
    const ak = actor?.kind ?? '?';
    const tk = target?.kind ?? '?';
    const key = `${ak}→${tk}`;
    dcPatterns.set(key, (dcPatterns.get(key) ?? 0) + 1);
  }
}
console.log(`\nDisconnect actor→target kind patterns:`);
for (const [k, v] of dcPatterns) console.log(`  ${k}: ${v}`);

// For each component that transitioned to freestanding: count disconnect events where they were removed
// Actually let's reconstruct per-object disconnect count
const disconnectByObject = new Map<number, number>();
for (const l of log) {
  if (l.ev.type === 'disconnect_applied') {
    const a = (l.ev as any).actorId;
    const t = (l.ev as any).targetId;
    disconnectByObject.set(a, (disconnectByObject.get(a) ?? 0) + 1);
    disconnectByObject.set(t, (disconnectByObject.get(t) ?? 0) + 1);
  }
}

// Count distribution
const distribCounts = new Map<number, number>();
for (const p of procs) {
  const c = disconnectByObject.get(p.id) ?? 0;
  distribCounts.set(c, (distribCounts.get(c) ?? 0) + 1);
}
console.log(`\nDisconnect count per processor:`);
for (const [c, n] of [...distribCounts.entries()].sort()) console.log(`  ${c} disconnects: ${n} procs`);

// Which tick did the most disconnects happen?
const perTickDc = new Map<number, number>();
for (const l of log) {
  if (l.ev.type === 'disconnect_applied') {
    perTickDc.set(l.tick, (perTickDc.get(l.tick) ?? 0) + 1);
  }
}
const busyTicks = [...perTickDc.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
console.log(`\nBusiest disconnect ticks:`);
for (const [t, c] of busyTicks) console.log(`  tick ${t}: ${c} disconnects`);
