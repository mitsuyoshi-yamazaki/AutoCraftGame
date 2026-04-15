/**
 * CLI test script — runs v8 simulation and reports on self-replication via connection.
 */

import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createInitialState, DEFAULT_INITIAL_CONFIG } from '../src/initial-state.js';
import { executeTick } from '../src/simulation.js';
import type { AssemblerObject, ProcessorObject } from '../src/types.js';

const TICKS = 500;
const REPORT_INTERVAL = 50;

const params = DEFAULT_GAME_PARAMS;
let world = createInitialState();

console.log(`=== v8 Self-Replication Test (${TICKS} ticks) ===`);
console.log(`World: ${world.width}x${world.height}`);
console.log(`Initial objects: ${world.objects.length}`);

const counts = countByKind(world);
console.log(`  Assemblers: ${counts.assembler} (gathering: ${counts.assemblerGathering})`);
console.log(`  Processors: ${counts.processor} (running: ${counts.processorRunning})`);
console.log(`  Materials: ${counts.material}`);
console.log(`  Energy objects: ${counts.energy}`);
console.log();

let totalCreated = 0;
let totalDestroyed = 0;

for (let t = 0; t < TICKS; t++) {
  const result = executeTick(world, params);
  world = result.world;

  for (const event of result.events) {
    if (event.type === 'object_created') totalCreated++;
    if (event.type === 'object_destroyed') totalDestroyed++;
    if (event.type === 'assembler_completed') {
      console.log(`  [tick ${world.tick}] Assembler ${event.id} produced ${event.productId}`);
    }
  }

  if ((t + 1) % REPORT_INTERVAL === 0) {
    const c = countByKind(world);
    console.log(
      `tick ${String(world.tick).padStart(4)} | ` +
      `asm:${c.assembler}(g:${c.assemblerGathering}) proc:${c.processor}(r:${c.processorRunning}) ` +
      `groups:${c.groups} mat:${c.material} eng:${c.energy} | ` +
      `created:${totalCreated} destroyed:${totalDestroyed}`
    );
  }
}

console.log();
console.log('=== Final ===');
const final = countByKind(world);
console.log(`Assemblers: ${final.assembler} (gathering: ${final.assemblerGathering}, assembling: ${final.assemblerAssembling})`);
console.log(`Processors: ${final.processor} (running: ${final.processorRunning})`);
console.log(`Materials: ${final.material}`);
console.log(`Energy: ${final.energy}`);
console.log(`Total created: ${totalCreated}, destroyed: ${totalDestroyed}`);

function countByKind(w: typeof world) {
  let assembler = 0, assemblerGathering = 0, assemblerAssembling = 0;
  let processor = 0, processorRunning = 0;
  let material = 0, energy = 0, groups = 0;
  for (const obj of w.objects) {
    switch (obj.kind) {
      case 'assembler': {
        assembler++;
        const asm = obj as AssemblerObject;
        if (asm.phase === 'gathering') assemblerGathering++;
        if (asm.phase === 'assembling') assemblerAssembling++;
        break;
      }
      case 'processor':
        processor++;
        if ((obj as ProcessorObject).running) processorRunning++;
        break;
      case 'material': material++; break;
      case 'energy': energy++; break;
      case 'group': groups++; break;
    }
  }
  return { assembler, assemblerGathering, assemblerAssembling, processor, processorRunning, material, energy, groups };
}
