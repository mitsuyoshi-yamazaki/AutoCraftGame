/**
 * Debug script: trace which characters apoptose and why.
 */
import { readFileSync } from 'fs';
import type { ProgramDefinition } from '../src/types.js';
import { createRng } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

const engine = createEngine(DEFAULT_GAME_PARAMS);
const rng = createRng(42);
let world = engine.createWorld(DEFAULT_WORLD_CONFIG, rng);
const def = JSON.parse(readFileSync('programs/pioneer_def.json', 'utf-8')) as ProgramDefinition & { count: number };
def.count = 5;
world = engine.spawnInitialCharacters(world, [def], rng);

// Track max idle/instr counts for char-005 (which apoptosed in earlier test)
const trackId = 'char-005';
let maxIdle = 0;
let maxInstr = 0;
for (let i = 0; i < 500; i++) {
  const result = engine.executeTick(world);
  world = result.world;
  const c = world.characters.find((ch) => ch.id === trackId);
  if (c) {
    if (c.idleTickCount > maxIdle) maxIdle = c.idleTickCount;
    if (c.instrLimitTickCount > maxInstr) maxInstr = c.instrLimitTickCount;
  }
  if (result.apoptosisDeaths.has(trackId)) {
    console.log(`tick ${i+1}: ${trackId} APOPTOSED (idle=${maxIdle}, instr=${maxInstr})`);
    break;
  }
}
console.log(`${trackId} max idle=${maxIdle}, max instr_limit=${maxInstr}`);

// Also check all surviving characters' max counters at end
console.log('\nFinal counter state of surviving characters:');
for (const c of world.characters) {
  if (c.idleTickCount > 30 || c.instrLimitTickCount > 5) {
    console.log(`  ${c.id}: idle=${c.idleTickCount}, instr_limit=${c.instrLimitTickCount}`);
  }
}
