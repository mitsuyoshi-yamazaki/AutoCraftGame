/**
 * Tuning simulation script for v4.
 * Runs the simulation with one or more species and collects statistics.
 *
 * Usage: npx tsx scripts/tuning-run.ts [options]
 *   --ticks N              Number of ticks (default: 5000)
 *   --seed N               RNG seed (default: 42)
 *   --snapshot-interval N  Snapshot interval (default: 500)
 *   --count N              Initial count per species (default: 3)
 *   --programs P1,P2,...   Comma-separated program def paths
 *                          (default: programs/replicator_def.json)
 *   --map-size WxH         Map size override
 *   --ore-nodes N          Ore node count
 *   --crystal-nodes N      Crystal node count
 *   --energy-nodes N       Energy node count
 *   --node-remaining N     Initial remaining per node
 *   --energy-prod-rate N   Energy production rate per tick
 *   --energy-max-stored N  Max energy stored per node
 */
import { readFileSync } from 'fs';
import type { ComponentType, ProgramDefinition, World } from '../src/types.js';
import { createRng } from '../src/world.js';
import type { WorldConfig } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

// ============================================================
// Snapshot type
// ============================================================
interface Snapshot {
  tick: number;
  totalCharacters: number;
  species: Record<string, number>;
  resourceNodes: number;
  totalEnergy: number;
  totalRemains: number;
  births: number;
  deaths: number;
  actions: Record<string, { success: number; fail: number }>;
}

// ============================================================
// Config
// ============================================================
function parseArgs(args: string[]) {
  let ticks = 5000;
  let seed = 42;
  let snapshotInterval = 500;
  let count = 3;
  let programPaths = ['programs/replicator_def.json'];
  const configOverrides: Partial<WorldConfig> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticks': ticks = parseInt(args[++i], 10); break;
      case '--seed': seed = parseInt(args[++i], 10); break;
      case '--snapshot-interval': snapshotInterval = parseInt(args[++i], 10); break;
      case '--count': count = parseInt(args[++i], 10); break;
      case '--programs': programPaths = args[++i].split(','); break;
      case '--map-size': {
        const [w, h] = args[++i].split('x').map(Number);
        configOverrides.width = w;
        configOverrides.height = h;
        break;
      }
      case '--ore-nodes': configOverrides.oreNodeCount = parseInt(args[++i], 10); break;
      case '--crystal-nodes': configOverrides.crystalNodeCount = parseInt(args[++i], 10); break;
      case '--energy-nodes': configOverrides.energyNodeCount = parseInt(args[++i], 10); break;
      case '--node-remaining': configOverrides.nodeRemaining = parseInt(args[++i], 10); break;
      case '--energy-prod-rate': configOverrides.energyProductionRate = parseInt(args[++i], 10); break;
      case '--energy-max-stored': configOverrides.energyMaxStored = parseInt(args[++i], 10); break;
    }
  }
  return { ticks, seed, snapshotInterval, count, programPaths, configOverrides };
}

function loadProgramDef(path: string, defaultCount: number): ProgramDefinition {
  const json = JSON.parse(readFileSync(path, 'utf-8'));
  return {
    name: json.name ?? 'Unknown',
    components: json.components ?? [
      'Frame', 'Frame', 'Frame', 'Actuator', 'Harvester',
      'Charger', 'Assembler', 'Processor', 'Sensor', 'MemoryCore', 'MemoryCore',
    ],
    program: json.program ?? [],
    count: json.count ?? defaultCount,
  };
}

// ============================================================
// Main
// ============================================================
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const definitions = opts.programPaths.map(p => loadProgramDef(p, opts.count));
  const paramOverrides: Record<string, number> = {};
  // Parse param overrides from --param key=value
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--param' && i + 1 < process.argv.length) {
      const [key, val] = process.argv[i + 1].split('=');
      paramOverrides[key] = parseFloat(val);
      i++;
    }
  }
  const params = { ...DEFAULT_GAME_PARAMS, ...paramOverrides } as typeof DEFAULT_GAME_PARAMS;
  if (Object.keys(paramOverrides).length > 0) {
    console.log(`Param overrides: ${Object.entries(paramOverrides).map(([k,v]) => `${k}=${v}`).join(', ')}`);
  }
  const engine = createEngine(params);
  const worldConfig: WorldConfig = { ...DEFAULT_WORLD_CONFIG, ...opts.configOverrides };
  const rng = createRng(opts.seed);

  let world = engine.createWorld(worldConfig, rng);
  world = engine.spawnInitialCharacters(world, definitions, rng);

  // Run simulation
  const snapshots: Snapshot[] = [];
  let totalBirths = 0;
  let totalDeaths = 0;
  let intervalBirths = 0;
  let intervalDeaths = 0;
  let extinctionTick: number | null = null;

  // Track action success/failure per interval
  let intervalActions: Record<string, { success: number; fail: number }> = {};

  const speciesFirstSeen = new Map<string, number>();
  const speciesLastSeen = new Map<string, number>();
  for (const def of definitions) {
    speciesFirstSeen.set(def.name, 0);
    speciesLastSeen.set(def.name, 0);
  }

  const takeSnapshot = (w: World, tick: number): Snapshot => {
    const species: Record<string, number> = {};
    for (const c of w.characters) {
      species[c.species] = (species[c.species] ?? 0) + 1;
    }
    const totalEnergy = w.energyNodes.reduce((s, n) => s + n.stored, 0);
    return {
      tick,
      totalCharacters: w.characters.length,
      species,
      resourceNodes: w.resourceNodes.length,
      totalEnergy,
      totalRemains: w.remains.length,
      births: intervalBirths,
      deaths: intervalDeaths,
      actions: { ...intervalActions },
    };
  };

  snapshots.push(takeSnapshot(world, 0));

  for (let t = 1; t <= opts.ticks; t++) {
    const result = engine.executeTick(world);
    world = result.world;

    for (const event of result.events) {
      if (event.type === 'character_spawned') { totalBirths++; intervalBirths++; }
      if (event.type === 'character_died') { totalDeaths++; intervalDeaths++; }
    }

    // Track actions
    for (const [, records] of result.actions) {
      for (const rec of records) {
        if (!intervalActions[rec.op]) intervalActions[rec.op] = { success: 0, fail: 0 };
        if (rec.success) intervalActions[rec.op].success++;
        else intervalActions[rec.op].fail++;
      }
    }

    for (const c of world.characters) {
      if (!speciesFirstSeen.has(c.species)) speciesFirstSeen.set(c.species, t);
      speciesLastSeen.set(c.species, t);
    }

    if (t % opts.snapshotInterval === 0) {
      snapshots.push(takeSnapshot(world, t));
      intervalBirths = 0;
      intervalDeaths = 0;
      intervalActions = {};
    }

    if (world.characters.length === 0) {
      extinctionTick = t;
      if (t % opts.snapshotInterval !== 0) {
        snapshots.push(takeSnapshot(world, t));
      }
      break;
    }
  }

  const lastSnap = snapshots[snapshots.length - 1];
  if (lastSnap.tick !== world.tick) {
    snapshots.push(takeSnapshot(world, world.tick));
  }

  // Output
  console.log('=== v4 Tuning Simulation ===');
  console.log(`Seed: ${opts.seed}`);
  console.log(`Ticks: ${opts.ticks}`);
  console.log(`World: ${worldConfig.width}x${worldConfig.height}`);
  console.log(`OreNodes: ${worldConfig.oreNodeCount}, CrystalNodes: ${worldConfig.crystalNodeCount}, EnergyNodes: ${worldConfig.energyNodeCount}`);
  console.log(`NodeRemaining: ${worldConfig.nodeRemaining}, EnergyProdRate: ${worldConfig.energyProductionRate}, EnergyMaxStored: ${worldConfig.energyMaxStored}`);
  console.log(`Programs: ${definitions.map(p => `${p.name}(x${p.count})`).join(', ')}`);
  console.log(`Initial energy: ${params.assembleEnergyTransfer}`);
  console.log(`Metabolism: ${definitions.map(d => {
    const m = d.components.reduce((s, c) => s + params.metabolism[c as ComponentType], 0);
    return `${d.name}=${m}`;
  }).join(', ')}`);
  console.log('');

  if (extinctionTick !== null) {
    console.log(`*** ALL EXTINCT at tick ${extinctionTick} ***`);
  }
  console.log(`Total births: ${totalBirths}, Total deaths: ${totalDeaths}`);
  console.log('');

  console.log('--- Species Lifespan ---');
  for (const [name, first] of speciesFirstSeen.entries()) {
    const last = speciesLastSeen.get(name) ?? first;
    console.log(`  ${name}: tick ${first} - ${last} (${last - first} ticks)`);
  }
  console.log('');

  // Snapshot table
  console.log('--- Snapshots ---');
  const allSpeciesNames = new Set<string>();
  for (const snap of snapshots) {
    for (const name of Object.keys(snap.species)) allSpeciesNames.add(name);
  }
  const speciesNames = [...allSpeciesNames].sort();

  const header = ['tick', 'chars', ...speciesNames, 'resNodes', 'energy', 'remains', 'births', 'deaths'];
  console.log(header.join('\t'));
  for (const snap of snapshots) {
    const row = [
      snap.tick,
      snap.totalCharacters,
      ...speciesNames.map(n => snap.species[n] ?? 0),
      snap.resourceNodes,
      snap.totalEnergy,
      snap.totalRemains,
      snap.births,
      snap.deaths,
    ];
    console.log(row.join('\t'));
  }

  // Action summary
  console.log('');
  console.log('--- Action Summary (last interval) ---');
  const lastActions = snapshots[snapshots.length - 1].actions;
  for (const [op, counts] of Object.entries(lastActions).sort()) {
    const total = counts.success + counts.fail;
    const rate = total > 0 ? Math.round(100 * counts.success / total) : 0;
    console.log(`  ${op}: ${counts.success}/${total} (${rate}%)`);
  }

  // Character detail (for debugging)
  if (world.characters.length > 0 && world.characters.length <= 10) {
    console.log('');
    console.log('--- Character Detail ---');
    for (const c of world.characters) {
      const inv = Object.entries(c.inventory).map(([k, v]) => `${k}:${v}`).join(' ');
      console.log(`  ${c.id} ${c.species} E:${c.energy} D:${Math.round(c.durability)} pos:(${c.position.x.toFixed(1)},${c.position.y.toFixed(1)}) inv:[${inv}] vm:${c.vm.active ? 'active' : 'inactive'} pc:${c.vm.pc}`);
    }
  }
}

main();
