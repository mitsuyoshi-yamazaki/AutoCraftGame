/**
 * Debug memory corruption around replication tick.
 */
import { readFileSync } from 'fs';
import type { ProgramDefinition } from '../src/types.js';
import { createRng, DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

const defJson = JSON.parse(readFileSync('programs/replicator_def.json', 'utf-8'));
const def: ProgramDefinition = { ...defJson, count: 1 };
const params = { ...DEFAULT_GAME_PARAMS, assembleEnergyTransfer: 500, rechargeAmount: 1000, inventoryMetabolismPerItem: 0 };
const engine = createEngine(params);
const rng = createRng(42);
let world = engine.createWorld(DEFAULT_WORLD_CONFIG, rng);
world = engine.spawnInitialCharacters(world, [def], rng);
const charId = world.characters[0].id;

for (let t = 0; t < 540; t++) {
  const c = world.characters.find(ch => ch.id === charId);
  if (!c) { console.log(`Tick ${t+1}: char dead`); break; }

  // Before-tick memory snapshot
  const memBefore = [...c.vm.memory.slice(0, 10)];

  const result = engine.executeTick(world);
  world = result.world;

  const u = world.characters.find(ch => ch.id === charId);
  if (!u) { console.log(`Tick ${t+1}: char died after tick`); break; }

  const memAfter = [...u.vm.memory.slice(0, 10)];
  const actions = result.actions.get(charId) ?? [];
  const actionStr = actions.map(a => a.op + ':' + (a.success ? 'OK' : 'F')).join(',');

  // Only print interesting ticks (around replication)
  if (t >= 525 && t <= 535) {
    console.log(`--- Tick ${t+1} ---`);
    console.log(`  Actions: [${actionStr}]`);
    console.log(`  E: ${u.energy} D: ${Math.round(u.durability)} PC: ${u.vm.pc}`);
    console.log(`  mem[0..9] before: [${memBefore.join(',')}]`);
    console.log(`  mem[0..9] after:  [${memAfter.join(',')}]`);
    console.log(`  Characters in world: ${world.characters.length}`);
    // Print events
    for (const ev of result.events) {
      if (ev.type === 'character_spawned') console.log(`  BIRTH: ${ev.parentId} -> ${ev.childId}`);
    }
  }
}
