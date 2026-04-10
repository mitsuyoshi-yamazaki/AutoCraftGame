/**
 * Quick parameter sweep with 2000 ticks each.
 */
import { readFileSync } from 'fs';
import type { ProgramDefinition } from '../src/types.js';
import { createRng } from '../src/world.js';
import type { WorldConfig } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

function loadDef(file: string, count: number): ProgramDefinition {
  const def = JSON.parse(readFileSync(file, 'utf-8')) as ProgramDefinition & { count: number };
  return { ...def, count };
}

function run(ticks: number, seed: number, count: number, world: Partial<WorldConfig>) {
  const engine = createEngine(DEFAULT_GAME_PARAMS);
  const rng = createRng(seed);
  let w = engine.createWorld({ ...DEFAULT_WORLD_CONFIG, ...world }, rng);
  const defs = [
    loadDef('programs/asex_evolver_def.json', count),
    loadDef('programs/sex_evolver_def.json', count),
    loadDef('programs/patroller_def.json', count),
  ];
  w = engine.spawnInitialCharacters(w, defs, rng);
  let births = 0, deaths = 0, finalTick = 0;
  for (let i = 0; i < ticks; i++) {
    const r = engine.executeTick(w);
    w = r.world;
    births += r.events.filter((e) => e.type === 'character_spawned').length;
    deaths += r.events.filter((e) => e.type === 'character_died').length;
    finalTick = w.tick;
    if (w.characters.length === 0) break;
  }
  const counts: Record<string, number> = {};
  for (const c of w.characters) counts[c.species] = (counts[c.species] ?? 0) + 1;
  return { finalChars: w.characters.length, asex: counts.AsexEvolver ?? 0, sex: counts.SexEvolver ?? 0, pat: counts.Patroller ?? 0, births, deaths, finalTick };
}

const TICKS = 2000;
console.log('cnt\tworld\tnodes\tfinT\tchars\ta/s/p\tbirths\tdeaths');
const cases: { count: number; world: Partial<WorldConfig>; label: string }[] = [
  { count: 5,  world: {}, label: 'baseline' },
  { count: 10, world: {}, label: '10x3' },
  { count: 5,  world: { width: 80, height: 60 }, label: 'small' },
  { count: 10, world: { width: 80, height: 60 }, label: '10x3 small' },
  { count: 10, world: { width: 80, height: 60, oreNodeCount: 150, crystalNodeCount: 150, energyNodeCount: 150 }, label: '10x3 small dense' },
];
for (const c of cases) {
  const r = run(TICKS, 42, c.count, c.world);
  const w = `${c.world.width ?? 120}x${c.world.height ?? 80}`;
  console.log(`${c.count}\t${w}\t${c.world.oreNodeCount ?? 100}/${c.world.energyNodeCount ?? 100}\t${r.finalTick}\t${r.finalChars}\t${r.asex}/${r.sex}/${r.pat}\t${r.births}\t${r.deaths}\t# ${c.label}`);
}
