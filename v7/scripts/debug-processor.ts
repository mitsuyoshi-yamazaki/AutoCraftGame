/**
 * Debug: trace one processor set to understand why new Processors aren't started.
 */
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createEmptyWorld, addObject, nextObjectId } from '../src/world.js';
import { createAssembler } from '../src/assembler.js';
import { createProcessor } from '../src/processor.js';
import { generateReplicatorProgram } from '../src/programs.js';
import { executeTick } from '../src/simulation.js';
import type { AssemblerObject, ProcessorObject, MaterialObject, EnergyObject } from '../src/types.js';

// Create a minimal world: one set of a,b,c,d + materials + energy, all close together
let world = createEmptyWorld(20, 20);
const cx = 10, cy = 10;
let id: string;

// a: Assembler(recipe=3, gathering)
({ id, world } = nextObjectId(world));
world = addObject(world, createAssembler(id, { x: cx, y: cy }, 3, 'gathering'));
const asmAId = id;

// b: Assembler(recipe=4, gathering)
({ id, world } = nextObjectId(world));
world = addObject(world, createAssembler(id, { x: cx + 1, y: cy }, 4, 'gathering'));
const asmBId = id;

// c: Processor running (recipe=3)
({ id, world } = nextObjectId(world));
const progC = generateReplicatorProgram(3);
world = addObject(world, createProcessor(id, { x: cx, y: cy + 1 }, progC, true));
const procCId = id;

// d: Processor running (recipe=4)
({ id, world } = nextObjectId(world));
const progD = generateReplicatorProgram(4);
world = addObject(world, createProcessor(id, { x: cx + 1, y: cy + 1 }, progD, true));
const procDId = id;

// Materials: Metal × 5, Circuit × 10
for (let i = 0; i < 5; i++) {
  ({ id, world } = nextObjectId(world));
  world = addObject(world, {
    id, kind: 'material', position: { x: cx + (Math.random()-0.5)*2, y: cy + (Math.random()-0.5)*2 },
    orientation: 0, materialType: 'Metal', amount: 1,
  } as MaterialObject);
}
for (let i = 0; i < 10; i++) {
  ({ id, world } = nextObjectId(world));
  world = addObject(world, {
    id, kind: 'material', position: { x: cx + (Math.random()-0.5)*2, y: cy + (Math.random()-0.5)*2 },
    orientation: 0, materialType: 'Circuit', amount: 1,
  } as MaterialObject);
}

// Energy
({ id, world } = nextObjectId(world));
world = addObject(world, {
  id, kind: 'energy', position: { x: cx, y: cy }, orientation: 0, amount: 500,
} as EnergyObject);

// Use tiny random movement to keep things close
const params = { ...DEFAULT_GAME_PARAMS, randomMovementRange: 0.1, instructionsPerTick: 10000 };

console.log(`Initial: ${world.objects.length} objects`);
console.log(`Processor c program size: ${progC.length} words`);

for (let t = 0; t < 200; t++) {
  const result = executeTick(world, params);
  world = result.world;

  // Report events
  for (const event of result.events) {
    if (event.type === 'assembler_completed') {
      const product = world.objects.find(o => o.id === event.productId);
      console.log(`[tick ${world.tick}] ${event.id} produced ${event.productId} (${product?.kind})`);
    }
  }

  // Check running processor count
  const procs = world.objects.filter(o => o.kind === 'processor') as ProcessorObject[];
  const running = procs.filter(p => p.running);
  const stopped = procs.filter(p => !p.running);

  if (procs.length > 4 || (t + 1) % 50 === 0) {
    console.log(
      `[tick ${world.tick}] procs: ${procs.length} (running: ${running.length}, stopped: ${stopped.length})` +
      ` | asms: ${world.objects.filter(o => o.kind === 'assembler').length}`
    );
    for (const p of stopped) {
      const nonZero = p.memory.filter(w => w !== 0).length;
      console.log(`  stopped proc ${p.id}: mem nonzero=${nonZero}, pc=${p.pc}, opmem[2]=${p.operationMemory[2]}`);
    }
    for (const p of running) {
      if (p.id !== procCId && p.id !== procDId) {
        console.log(`  NEW running proc ${p.id}: pc=${p.pc}`);
      }
    }
  }
}
