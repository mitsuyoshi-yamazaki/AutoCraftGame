/**
 * Compare pioneer and asex_evolver lifecycles directly.
 */
import { readFileSync } from 'fs';
import type { ProgramDefinition } from '../src/types.js';
import { createRng } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

function trace(defFile: string) {
  const engine = createEngine(DEFAULT_GAME_PARAMS);
  const rng = createRng(42);
  let world = engine.createWorld(DEFAULT_WORLD_CONFIG, rng);
  const def = JSON.parse(readFileSync(defFile, 'utf-8')) as ProgramDefinition & { count: number };
  def.count = 5;
  world = engine.spawnInitialCharacters(world, [def], rng);

  const trackId = 'char-001';
  let lastInvCount = -1;
  for (let i = 0; i < 200; i++) {
    const result = engine.executeTick(world);
    world = result.world;
    const c = world.characters.find((ch) => ch.id === trackId);
    if (!c) {
      console.log(`  t=${i+1} DEAD`);
      break;
    }
    const invCount = Object.values(c.inventory).reduce((a, b) => a + b, 0);
    if (invCount !== lastInvCount || i % 50 === 0) {
      const inv = Object.entries(c.inventory).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(',');
      console.log(`  t=${i+1} energy=${c.energy} inv=${inv || '-'}`);
      lastInvCount = invCount;
    }
  }
}

console.log('=== pioneer ===');
trace('programs/pioneer_def.json');
console.log('\n=== asex_evolver ===');
trace('programs/asex_evolver_def.json');
