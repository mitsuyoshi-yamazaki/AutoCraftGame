/**
 * M3 comparison script.
 * Runs the same simulation with apoptosis enabled vs disabled and reports
 * the difference in births/deaths to evaluate whether M3 affects healthy
 * pioneer behavior.
 */
import { readFileSync } from 'fs';
import type { ProgramDefinition } from '../src/types.js';
import { createRng } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

function run(label: string, params: typeof DEFAULT_GAME_PARAMS) {
  const engine = createEngine(params);
  const rng = createRng(42);
  let world = engine.createWorld(DEFAULT_WORLD_CONFIG, rng);
  const def = JSON.parse(readFileSync('programs/pioneer_def.json', 'utf-8')) as ProgramDefinition & { count: number };
  def.count = 5;
  world = engine.spawnInitialCharacters(world, [def], rng);

  let totalApoptosis = 0;
  let totalDeaths = 0;
  let totalBirths = 0;
  for (let i = 0; i < 500; i++) {
    const result = engine.executeTick(world);
    world = result.world;
    totalApoptosis += result.apoptosisDeaths.size;
    totalDeaths += result.events.filter((e) => e.type === 'character_died').length;
    totalBirths += result.events.filter((e) => e.type === 'character_spawned').length;
  }
  console.log(`${label}: chars=${world.characters.length} births=${totalBirths} deaths=${totalDeaths} apoptosisDeaths=${totalApoptosis}`);
}

run('M3 enabled (default)', DEFAULT_GAME_PARAMS);
run('M3 disabled', {
  ...DEFAULT_GAME_PARAMS,
  apoptosisIdleTickLimit: 1000000,
  apoptosisInstrLimitTickLimit: 1000000,
});
