/**
 * Long-run test of best parameters for 3 species coexistence.
 * Best so far: 10x3 species, 80x60 world, 150/150 ore/crystal nodes, 150 energy nodes
 */
import { readFileSync } from 'fs';
import type { ProgramDefinition } from '../src/types.js';
import { createRng } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

function loadDef(file: string, count: number): ProgramDefinition {
  const def = JSON.parse(readFileSync(file, 'utf-8')) as ProgramDefinition & { count: number };
  return { ...def, count };
}

const engine = createEngine(DEFAULT_GAME_PARAMS);
const rng = createRng(42);
let world = engine.createWorld({
  ...DEFAULT_WORLD_CONFIG,
  width: 80, height: 60,
  oreNodeCount: 150, crystalNodeCount: 150, energyNodeCount: 150,
}, rng);
const defs = [
  loadDef('programs/asex_evolver_def.json', 10),
  loadDef('programs/sex_evolver_def.json', 10),
  loadDef('programs/patroller_def.json', 10),
];
world = engine.spawnInitialCharacters(world, defs, rng);

console.log('tick\tchars\tasex\tsex\tpat\tbirths\tdeaths');
let totalBirths = 0, totalDeaths = 0;
const samples = [1, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
let nextIdx = 0;
for (let i = 0; i < 10000; i++) {
  const r = engine.executeTick(world);
  world = r.world;
  totalBirths += r.events.filter((e) => e.type === 'character_spawned').length;
  totalDeaths += r.events.filter((e) => e.type === 'character_died').length;
  if (samples[nextIdx] === world.tick || world.characters.length === 0) {
    const counts: Record<string, number> = {};
    for (const c of world.characters) counts[c.species] = (counts[c.species] ?? 0) + 1;
    console.log(`${world.tick}\t${world.characters.length}\t${counts.AsexEvolver ?? 0}\t${counts.SexEvolver ?? 0}\t${counts.Patroller ?? 0}\t${totalBirths}\t${totalDeaths}`);
    nextIdx++;
    if (world.characters.length === 0) break;
  }
}
