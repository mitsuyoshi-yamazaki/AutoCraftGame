/**
 * CLI test script for primitive-based characters.
 * Runs a simulation with primitive seeds and reports population dynamics.
 */

import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { DEFAULT_WORLD_CONFIG, createRng } from '../src/world.js';
import { ALL_PRIMITIVE_SEEDS } from '../src/seeds.js';

const TICKS = 2000;
const SEED = 42;
const REPORT_INTERVAL = 100;

const params = {
  ...DEFAULT_GAME_PARAMS,
  nodeRegenerationThreshold: 100,
  frameDurability: 1200,          // Double durability for longer life
  assembleEnergyTransfer: 1000,   // More starting energy
  metabolism: {
    Frame: 0,
    Actuator: 0,
    Sensor: 0,
    Processor: 2,
    Harvester: 0,
    Assembler: 1,
    Disassembler: 0,
    Charger: 0,
    MemoryCore: 0,
  },
};

const engine = createEngine(params);
const rng = createRng(SEED);
let world = engine.createWorld(
  { ...DEFAULT_WORLD_CONFIG, width: 60, height: 60, oreNodeCount: 80, crystalNodeCount: 80, energyNodeCount: 120, nodeRemaining: 300, energyMaxStored: 1600 },
  rng,
);
world = engine.spawnPrimitiveCharacters(world, ALL_PRIMITIVE_SEEDS, rng);

console.log(`=== Primitive Character Test (${TICKS} ticks, seed=${SEED}) ===`);
console.log(`Initial: ${world.characters.length} characters`);
console.log(`Species: ${[...new Set(world.characters.map(c => c.species))].join(', ')}`);
console.log();

let totalBirths = 0;
let totalDeaths = 0;

for (let t = 0; t < TICKS; t++) {
  const result = engine.executeTick(world);
  world = result.world;

  let births = 0;
  let deaths = 0;
  for (const event of result.events) {
    if (event.type === 'character_spawned') births++;
    if (event.type === 'character_died') deaths++;
  }
  totalBirths += births;
  totalDeaths += deaths;

  if ((t + 1) % REPORT_INTERVAL === 0 || t === 0) {
    const speciesCounts = new Map<string, number>();
    for (const c of world.characters) {
      speciesCounts.set(c.species, (speciesCounts.get(c.species) ?? 0) + 1);
    }
    const speciesStr = [...speciesCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `${name}:${count}`)
      .join(', ');

    console.log(`tick ${String(t + 1).padStart(5)} | chars: ${String(world.characters.length).padStart(4)} | births: ${births} deaths: ${deaths} | ${speciesStr}`);
  }

  if (world.characters.length === 0) {
    console.log(`\n*** All characters extinct at tick ${t + 1} ***`);
    break;
  }
}

console.log();
console.log(`=== Summary ===`);
console.log(`Final: ${world.characters.length} characters`);
console.log(`Total births: ${totalBirths}, deaths: ${totalDeaths}`);
const finalSpecies = new Map<string, number>();
for (const c of world.characters) {
  finalSpecies.set(c.species, (finalSpecies.get(c.species) ?? 0) + 1);
}
for (const [name, count] of [...finalSpecies.entries()].sort(([, a], [, b]) => b - a)) {
  console.log(`  ${name}: ${count}`);
}
