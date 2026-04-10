/**
 * Parameter sweep for the 3 new species.
 * Tests various world sizes and node counts to find ecosystem-stable settings.
 */
import { readFileSync } from 'fs';
import type { ProgramDefinition } from '../src/types.js';
import { createRng } from '../src/world.js';
import type { WorldConfig } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

interface RunResult {
  finalChars: number;
  asex: number;
  sex: number;
  patroller: number;
  births: number;
  deaths: number;
  finalTick: number;
}

function loadDef(file: string, count: number): ProgramDefinition {
  const def = JSON.parse(readFileSync(file, 'utf-8')) as ProgramDefinition & { count: number };
  return { ...def, count };
}

function run(
  ticks: number, seed: number, countPerSpecies: number,
  worldOverride?: Partial<WorldConfig>,
): RunResult {
  const engine = createEngine(DEFAULT_GAME_PARAMS);
  const rng = createRng(seed);
  const config: WorldConfig = { ...DEFAULT_WORLD_CONFIG, ...(worldOverride ?? {}) };
  let world = engine.createWorld(config, rng);
  const defs = [
    loadDef('programs/asex_evolver_def.json', countPerSpecies),
    loadDef('programs/sex_evolver_def.json', countPerSpecies),
    loadDef('programs/patroller_def.json', countPerSpecies),
  ];
  world = engine.spawnInitialCharacters(world, defs, rng);
  let births = 0, deaths = 0;
  let finalTick = 0;
  for (let i = 0; i < ticks; i++) {
    const r = engine.executeTick(world);
    world = r.world;
    births += r.events.filter((e) => e.type === 'character_spawned').length;
    deaths += r.events.filter((e) => e.type === 'character_died').length;
    finalTick = world.tick;
    if (world.characters.length === 0) break;
  }
  const counts: Record<string, number> = {};
  for (const c of world.characters) {
    counts[c.species] = (counts[c.species] ?? 0) + 1;
  }
  return {
    finalChars: world.characters.length,
    asex: counts['AsexEvolver'] ?? 0,
    sex: counts['SexEvolver'] ?? 0,
    patroller: counts['Patroller'] ?? 0,
    births, deaths, finalTick,
  };
}

const TICKS = 5000;

console.log('=== Sweep: world size + count ===');
console.log('cnt\tworld   \tnodes\tfinalT\tchars\tasex/sex/pat\tbirths\tdeaths');
const cases: { count: number; world: Partial<WorldConfig> }[] = [
  { count: 5, world: {} },                                                       // baseline
  { count: 10, world: {} },                                                      // more individuals
  { count: 5, world: { width: 80, height: 60 } },                                // smaller world
  { count: 5, world: { oreNodeCount: 150, crystalNodeCount: 150 } },             // more nodes
  { count: 5, world: { energyNodeCount: 150 } },                                  // more energy
  { count: 10, world: { width: 80, height: 60 } },                                // dense
  { count: 10, world: { width: 80, height: 60, oreNodeCount: 150, crystalNodeCount: 150, energyNodeCount: 150 } },
  { count: 5, world: { width: 80, height: 60, oreNodeCount: 150, crystalNodeCount: 150, energyNodeCount: 150 } },
];
for (const c of cases) {
  const r = run(TICKS, 42, c.count, c.world);
  const w = `${c.world.width ?? 120}x${c.world.height ?? 80}`;
  const ore = c.world.oreNodeCount ?? 100;
  const cry = c.world.crystalNodeCount ?? 100;
  const en = c.world.energyNodeCount ?? 100;
  console.log(`${c.count}\t${w}\to${ore}c${cry}e${en}\t${r.finalTick}\t${r.finalChars}\t${r.asex}/${r.sex}/${r.patroller}\t${r.births}\t${r.deaths}`);
}
