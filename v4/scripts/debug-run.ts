/**
 * Debug script - runs ticks and prints per-character action details.
 * Usage: npx tsx scripts/debug-run.ts [initialEnergy] [ticks]
 */
import { readFileSync } from 'fs';
import type { ComponentType, ProgramDefinition } from '../src/types.js';
import { createRng } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

const initialEnergy = parseInt(process.argv[2] ?? '500', 10);
const maxTicks = parseInt(process.argv[3] ?? '30', 10);

const defJson = JSON.parse(readFileSync('programs/replicator_def.json', 'utf-8'));
const def: ProgramDefinition = {
  name: defJson.name,
  components: defJson.components,
  program: defJson.program,
  count: 1,
};

const rechargeAmt = parseInt(process.argv[4] ?? '200', 10);
const invMeta = parseFloat(process.argv[5] ?? '1');
const params = { ...DEFAULT_GAME_PARAMS, assembleEnergyTransfer: initialEnergy, rechargeAmount: rechargeAmt, inventoryMetabolismPerItem: invMeta };
const engine = createEngine(params);
const rng = createRng(42);
let world = engine.createWorld(DEFAULT_WORLD_CONFIG, rng);
world = engine.spawnInitialCharacters(world, [def], rng);

const charId = world.characters[0].id;
console.log(`E0=${initialEnergy} ticks=${maxTicks}`);
console.log(`tick\tE\tD\tphase\tcount\tcraft\tactions`);

for (let t = 0; t < maxTicks; t++) {
  const c = world.characters.find(ch => ch.id === charId);
  if (!c) { console.log(`${t+1}\tDEAD`); break; }

  const result = engine.executeTick(world);
  world = result.world;

  const u = world.characters.find(ch => ch.id === charId);
  if (!u) {
    const actions = result.actions.get(charId) ?? [];
    console.log(`${t+1}\tDIED\t\t${c.vm.memory[2]}\t${c.vm.memory[3]}\t${c.vm.memory[4]}\t${actions.map(a => a.op+':'+(a.success?'OK':'F')).join(',')}`);
    // Check for births
    for (const ev of result.events) {
      if (ev.type === 'character_spawned') console.log(`  BIRTH: ${ev.parentId} -> ${ev.childId}`);
    }
    break;
  }

  const actions = result.actions.get(charId) ?? [];
  const actionStr = actions.map(a => a.op+':'+(a.success?'OK':'F')).join(',');
  const mem = u.vm.memory;
  console.log(`${t+1}\t${u.energy}\t${Math.round(u.durability)}\t${mem[2]}\t${mem[3]}\t${mem[4]}\t${actionStr}`);

  // Check for births
  for (const ev of result.events) {
    if (ev.type === 'character_spawned') console.log(`  BIRTH: ${ev.parentId} -> ${ev.childId}`);
  }
}
