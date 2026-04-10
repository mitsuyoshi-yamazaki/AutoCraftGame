/**
 * Debug script: trace a single primitive character's actions tick by tick.
 */

import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { DEFAULT_WORLD_CONFIG, createRng } from '../src/world.js';
import { PRIMITIVE_REPLICATOR } from '../src/seeds.js';

const TICKS = 500;
const SEED = 42;

const params = {
  ...DEFAULT_GAME_PARAMS,
  nodeRegenerationThreshold: 100,
  frameDurability: 1200,
  assembleEnergyTransfer: 1000,
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
  { ...DEFAULT_WORLD_CONFIG, width: 30, height: 30, oreNodeCount: 40, crystalNodeCount: 40, energyNodeCount: 60, nodeRemaining: 300, energyMaxStored: 1600 },
  rng,
);
// Spawn just 1 replicator
world = engine.spawnPrimitiveCharacters(world, [{ ...PRIMITIVE_REPLICATOR, count: 1 }], rng);

const charId = world.characters[0].id;
console.log(`Tracking character ${charId}`);
console.log(`Position: (${world.characters[0].position.x.toFixed(1)}, ${world.characters[0].position.y.toFixed(1)})`);
console.log(`Energy: ${world.characters[0].energy}, Durability: ${world.characters[0].durability}`);
console.log(`Rules: ${world.characters[0].primitiveRules.length}`);
console.log(`Templates: ${world.characters[0].assemblyTemplates.length}`);
console.log();

for (let t = 0; t < TICKS; t++) {
  const result = engine.executeTick(world);
  world = result.world;

  const char = world.characters.find(c => c.id === charId);
  if (!char) {
    console.log(`tick ${t + 1}: CHARACTER DIED`);
    break;
  }

  const actions = result.actions.get(charId);
  const actionStr = actions && actions.length > 0
    ? actions.map(a => `${a.op}${a.success ? '' : `(FAIL:${a.reason})`}`).join(', ')
    : 'NONE';
  const reflexHit = result.reflexHits.has(charId);

  const inv = Object.entries(char.inventory).filter(([, v]) => v > 0);
  const invStr = inv.length > 0 ? inv.map(([k, v]) => `${k}:${v}`).join(' ') : '-';

  const pos = `(${char.position.x.toFixed(1)},${char.position.y.toFixed(1)})`;
  console.log(
    `tick ${String(t + 1).padStart(3)} | E:${String(char.energy).padStart(5)} D:${String(char.durability).padStart(4)} ` +
    `| action: ${actionStr.padEnd(30)} | reflex:${reflexHit ? 'Y' : 'N'} | pos:${pos.padEnd(12)} | inv: ${invStr}`
  );
}
