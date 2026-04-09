/**
 * Configurable iteration test script for long-term coexistence tuning.
 * Run as: npx tsx scripts/iter-test.ts <iter_id>
 */
import { readFileSync } from 'fs';
import type { ProgramDefinition } from '../src/types.js';
import { createRng } from '../src/world.js';
import type { WorldConfig } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { GameParams } from '../src/params.js';

interface IterConfig {
  label: string;
  countPerSpecies: number;
  worldOverride: Partial<WorldConfig>;
  paramsOverride: Partial<GameParams>;
}

const ITERATIONS: Record<string, IterConfig> = {
  baseline: {
    label: 'baseline (10x3, 80x60, dense)',
    countPerSpecies: 10,
    worldOverride: { width: 80, height: 60, oreNodeCount: 150, crystalNodeCount: 150, energyNodeCount: 150 },
    paramsOverride: {},
  },
  iter1: {
    label: 'Iter1: more resources (nodeRemaining 300, regen threshold 100)',
    countPerSpecies: 10,
    worldOverride: { width: 80, height: 60, oreNodeCount: 150, crystalNodeCount: 150, energyNodeCount: 150, nodeRemaining: 300, energyMaxStored: 3200 },
    paramsOverride: { nodeRegenerationThreshold: 100 },
  },
  iter2: {
    label: 'Iter2: same as iter1 + smaller world (mutation note: same; no behavior_mode mutation requires program change)',
    countPerSpecies: 10,
    worldOverride: { width: 80, height: 60, oreNodeCount: 200, crystalNodeCount: 200, energyNodeCount: 200, nodeRemaining: 300, energyMaxStored: 3200 },
    paramsOverride: { nodeRegenerationThreshold: 100 },
  },
  iter3: {
    label: 'Iter3: larger world',
    countPerSpecies: 10,
    worldOverride: { width: 120, height: 80, oreNodeCount: 250, crystalNodeCount: 250, energyNodeCount: 200, nodeRemaining: 300, energyMaxStored: 3200 },
    paramsOverride: { nodeRegenerationThreshold: 100 },
  },
  iter4: {
    label: 'Iter4: lower metabolism (Frame=1 → 0 etc.)',
    countPerSpecies: 10,
    worldOverride: { width: 80, height: 60, oreNodeCount: 150, crystalNodeCount: 150, energyNodeCount: 150, nodeRemaining: 300, energyMaxStored: 3200 },
    paramsOverride: {
      nodeRegenerationThreshold: 100,
      metabolism: {
        Frame: 0, Actuator: 1, Sensor: 1, Processor: 2, Harvester: 1,
        Assembler: 2, Disassembler: 1, Charger: 1, MemoryCore: 0,
      },
    },
  },
  iter5: {
    label: 'Iter5: best combo TBD',
    countPerSpecies: 10,
    worldOverride: { width: 80, height: 60, oreNodeCount: 200, crystalNodeCount: 200, energyNodeCount: 200, nodeRemaining: 300, energyMaxStored: 3200 },
    paramsOverride: {
      nodeRegenerationThreshold: 100,
      metabolism: {
        Frame: 0, Actuator: 1, Sensor: 1, Processor: 2, Harvester: 1,
        Assembler: 2, Disassembler: 1, Charger: 1, MemoryCore: 0,
      },
    },
  },
};

function loadDef(file: string, count: number): ProgramDefinition {
  const def = JSON.parse(readFileSync(file, 'utf-8')) as ProgramDefinition & { count: number };
  return { ...def, count };
}

function run(cfg: IterConfig, ticks: number) {
  const params = { ...DEFAULT_GAME_PARAMS, ...cfg.paramsOverride } as GameParams;
  const engine = createEngine(params);
  const rng = createRng(42);
  let world = engine.createWorld({ ...DEFAULT_WORLD_CONFIG, ...cfg.worldOverride }, rng);
  const defs = [
    loadDef('programs/asex_evolver_def.json', cfg.countPerSpecies),
    loadDef('programs/sex_evolver_def.json', cfg.countPerSpecies),
    loadDef('programs/patroller_def.json', cfg.countPerSpecies),
  ];
  world = engine.spawnInitialCharacters(world, defs, rng);

  console.log(`\n=== ${cfg.label} ===`);
  console.log('tick\tchars\tasex\tsex\tpat\tbirths\tdeaths');
  let totalBirths = 0, totalDeaths = 0;
  let peakChars = 0;
  const samples = [1, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
  let nextIdx = 0;
  for (let i = 0; i < ticks; i++) {
    const r = engine.executeTick(world);
    world = r.world;
    totalBirths += r.events.filter((e) => e.type === 'character_spawned').length;
    totalDeaths += r.events.filter((e) => e.type === 'character_died').length;
    if (world.characters.length > peakChars) peakChars = world.characters.length;
    if (samples[nextIdx] === world.tick || world.characters.length === 0) {
      const counts: Record<string, number> = {};
      for (const c of world.characters) counts[c.species] = (counts[c.species] ?? 0) + 1;
      console.log(`${world.tick}\t${world.characters.length}\t${counts.AsexEvolver ?? 0}\t${counts.SexEvolver ?? 0}\t${counts.Patroller ?? 0}\t${totalBirths}\t${totalDeaths}`);
      nextIdx++;
      if (world.characters.length === 0) break;
    }
  }
  console.log(`peak chars: ${peakChars}, final tick: ${world.tick}, total births: ${totalBirths}, total deaths: ${totalDeaths}`);
}

const iter = process.argv[2] ?? 'baseline';
const cfg = ITERATIONS[iter];
if (!cfg) {
  console.error(`Unknown iteration: ${iter}`);
  console.error(`Available: ${Object.keys(ITERATIONS).join(', ')}`);
  process.exit(1);
}
const ticks = parseInt(process.argv[3] ?? '10000', 10);
run(cfg, ticks);
