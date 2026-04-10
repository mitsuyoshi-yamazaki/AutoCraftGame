/**
 * Debug script: trace one asex_evolver character through its lifetime.
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
const def = JSON.parse(readFileSync('programs/asex_evolver_def.json', 'utf-8')) as ProgramDefinition & { count: number };
def.count = 5;
world = engine.spawnInitialCharacters(world, [def], rng);

const trackId = 'char-001';
console.log('tick energy durability inv_summary');
let lastInvCount = -1;
for (let i = 0; i < 400; i++) {
  const result = engine.executeTick(world);
  world = result.world;
  const c = world.characters.find((ch) => ch.id === trackId);
  if (!c) {
    console.log(`${i+1} DEAD`);
    break;
  }
  const invCount = Object.values(c.inventory).reduce((a: number, b: number) => a + b, 0);
  if (i % 5 === 0 || invCount !== lastInvCount || i < 10) {
    const inv = Object.entries(c.inventory).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${k}:${v}`).join(',');
    console.log(`${i+1} energy=${c.energy} dur=${c.durability} ${inv || '-'}`);
    lastInvCount = invCount;
  }
}
