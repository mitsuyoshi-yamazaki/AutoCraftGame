/**
 * Sweep apoptosis thresholds and report effect on healthy pioneer.
 */
import { readFileSync } from 'fs';
import type { ProgramDefinition } from '../src/types.js';
import { createRng } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

function run(idleLimit: number, instrLimit: number, seed: number) {
  const params = {
    ...DEFAULT_GAME_PARAMS,
    apoptosisIdleTickLimit: idleLimit,
    apoptosisInstrLimitTickLimit: instrLimit,
  };
  const engine = createEngine(params);
  const rng = createRng(seed);
  let world = engine.createWorld(DEFAULT_WORLD_CONFIG, rng);
  const def = JSON.parse(readFileSync('programs/pioneer_def.json', 'utf-8')) as ProgramDefinition & { count: number };
  def.count = 5;
  world = engine.spawnInitialCharacters(world, [def], rng);
  let totalApoptosis = 0;
  for (let i = 0; i < 500; i++) {
    const r = engine.executeTick(world);
    world = r.world;
    totalApoptosis += r.apoptosisDeaths.size;
  }
  return totalApoptosis;
}

console.log('Healthy pioneer false-positive apoptosis count over 5 seeds:');
console.log('idle\tinstr\tseed42\tseed1\tseed2\tseed7\tseed99\ttotal');
const cases: [number, number][] = [
  [100, 30],   // original default
  [200, 100],
  [300, 200],
  [500, 300],
  [500, 500],
  [1000, 500],
];
for (const [idle, instr] of cases) {
  const seeds = [42, 1, 2, 7, 99];
  const counts = seeds.map((s) => run(idle, instr, s));
  const total = counts.reduce((a, b) => a + b, 0);
  console.log(`${idle}\t${instr}\t${counts.join('\t')}\t${total}`);
}
