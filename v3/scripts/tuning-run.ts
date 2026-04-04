/**
 * Tuning simulation script for v3 (continuous space + physics).
 * Runs the simulation with one or more species and collects statistics.
 *
 * Usage: npx tsx scripts/tuning-run.ts [options]
 *   --ticks N              Number of ticks (default: 5000)
 *   --seed N               RNG seed (default: 42)
 *   --snapshot-interval N  Snapshot interval (default: 100)
 *   --map-size WxH         Map size (default: from DEFAULT_WORLD_CONFIG)
 *   --ore-nodes N          Ore node count
 *   --crystal-nodes N      Crystal node count
 *   --energy-nodes N       Energy node count
 *   --node-remaining N     Initial remaining per node
 *   --energy-prod-rate N   Energy production rate per tick
 *   --energy-max-stored N  Max energy stored per node
 *   --initial-energy N     Initial character energy
 *   --counts N[,N,...]     Initial counts per species (default: 3)
 */
import { readFileSync } from 'fs';
import type { Program, ComponentType, World } from '../src/types.js';
import { createRng, addCharacter } from '../src/world.js';
import type { WorldConfig } from '../src/world.js';
import { DEFAULT_WORLD_CONFIG } from '../src/world.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

// ============================================================
// Types
// ============================================================
interface ProgramDef {
  name: string;
  components: ComponentType[];
  program: Program;
  count: number;
}

interface Snapshot {
  tick: number;
  totalCharacters: number;
  species: Record<string, number>;
  resourceNodes: number;
  totalEnergy: number;
  totalRemains: number;
  births: number;
  deaths: number;
}

// ============================================================
// Config
// ============================================================
function parseArgs(args: string[]) {
  let ticks = 5000;
  let seed = 42;
  let snapshotInterval = 100;
  let initialEnergy = 5000;
  let counts = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
  const configOverrides: Partial<WorldConfig> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticks': ticks = parseInt(args[++i], 10); break;
      case '--seed': seed = parseInt(args[++i], 10); break;
      case '--snapshot-interval': snapshotInterval = parseInt(args[++i], 10); break;
      case '--initial-energy': initialEnergy = parseInt(args[++i], 10); break;
      case '--counts': counts = args[++i].split(',').map(Number); break;
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
  return { ticks, seed, snapshotInterval, initialEnergy, counts, configOverrides };
}

function loadProgram(path: string, count: number): ProgramDef {
  const json = JSON.parse(readFileSync(path, 'utf-8'));
  const rules = json.rules.map((r: any) => ({
    condition: r.condition,
    action: r.action,
    ...(r.set_registers ? { set_registers: r.set_registers } : {}),
  }));
  const components: ComponentType[] = json.components ?? [
    'Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'Charger', 'MemoryCore',
  ];
  const name = json.name ?? 'Unknown';
  return { name, components, program: { name, rules }, count };
}

// ============================================================
// Main
// ============================================================
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const programFiles = [
    'programs/self-replicator.json',
    'programs/self-replicator-explorer.json',
    'programs/self-replicator-wanderer.json',
    'programs/self-replicator-avoider.json',
    'programs/scavenger.json',
    'programs/scavenger-explorer.json',
    'programs/scavenger-wanderer.json',
    'programs/scavenger-avoider.json',
    'programs/opportunist.json',
    'programs/opportunist-explorer.json',
    'programs/opportunist-wanderer.json',
    'programs/opportunist-avoider.json',
  ];
  const programs: ProgramDef[] = programFiles.map((path, i) =>
    loadProgram(path, opts.counts[i] ?? 3),
  );

  const engine = createEngine(DEFAULT_GAME_PARAMS);
  const worldConfig: WorldConfig = { ...DEFAULT_WORLD_CONFIG, ...opts.configOverrides };
  const rng = createRng(opts.seed);
  let world = engine.createWorld(worldConfig, rng);

  // Place initial characters at random non-colliding positions
  for (const def of programs) {
    for (let i = 0; i < def.count; i++) {
      const pos = {
        x: 1 + rng() * (world.width - 2),
        y: 1 + rng() * (world.height - 2),
      };
      const id = `char-${String(world.nextCharacterId).padStart(3, '0')}`;
      world = { ...world, nextCharacterId: world.nextCharacterId + 1 };
      const character = engine.createCharacter(id, pos, [...def.components], def.program, opts.initialEnergy, def.name);
      world = addCharacter(world, character);
    }
  }

  // Run simulation
  const snapshots: Snapshot[] = [];
  let totalBirths = 0;
  let totalDeaths = 0;
  let intervalBirths = 0;
  let intervalDeaths = 0;
  let extinctionTick: number | null = null;

  const speciesFirstSeen = new Map<string, number>();
  const speciesLastSeen = new Map<string, number>();
  for (const def of programs) {
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

    for (const c of world.characters) {
      if (!speciesFirstSeen.has(c.species)) speciesFirstSeen.set(c.species, t);
      speciesLastSeen.set(c.species, t);
    }

    if (t % opts.snapshotInterval === 0) {
      snapshots.push(takeSnapshot(world, t));
      intervalBirths = 0;
      intervalDeaths = 0;
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
    intervalBirths = 0;
    intervalDeaths = 0;
    snapshots.push(takeSnapshot(world, world.tick));
  }

  // Output results
  console.log('=== v3 Tuning Simulation ===');
  console.log(`Seed: ${opts.seed}`);
  console.log(`Ticks: ${opts.ticks}`);
  console.log(`World: ${worldConfig.width}x${worldConfig.height}`);
  console.log(`OreNodes: ${worldConfig.oreNodeCount}, CrystalNodes: ${worldConfig.crystalNodeCount}, EnergyNodes: ${worldConfig.energyNodeCount}`);
  console.log(`NodeRemaining: ${worldConfig.nodeRemaining}, EnergyProdRate: ${worldConfig.energyProductionRate}, EnergyMaxStored: ${worldConfig.energyMaxStored}`);
  console.log(`Programs: ${programs.map(p => `${p.name}(x${p.count})`).join(', ')}`);
  console.log(`Initial energy: ${opts.initialEnergy}`);
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
}

main();
