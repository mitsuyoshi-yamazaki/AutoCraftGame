import { readFileSync } from 'fs';
import type { ComponentType, ProgramDefinition } from './types.js';
import { createRng } from './world.js';
import type { WorldConfig } from './world.js';
import { DEFAULT_WORLD_CONFIG } from './world.js';
import { createEngine } from './engine.js';
import { DEFAULT_GAME_PARAMS } from './params.js';
import { corruptCharacterMemory } from './corruption.js';

interface CorruptionOpts {
  readonly atTick: number;
  readonly count: number;
  readonly targetId: string | null;  // null = first active character
  readonly seed: number;
  readonly periodic: number;  // 0 = one-time; >0 = re-inject every N ticks
}

function parseArgs(args: string[]) {
  let ticks = 100;
  let programPaths: string[] = [];
  let output: 'tick' | 'final' | 'events' = 'final';
  let seed = 42;
  let worldSize: { width: number; height: number } | null = null;
  let countPerSpecies = 3;
  let corruptAtTick = -1;
  let corruptCount = 0;
  let corruptTargetId: string | null = null;
  let corruptSeed = 12345;
  let corruptPeriodic = 0;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticks': ticks = parseInt(args[++i], 10); break;
      case '--program': programPaths.push(args[++i]); break;
      case '--output': output = args[++i] as 'tick' | 'final' | 'events'; break;
      case '--seed': seed = parseInt(args[++i], 10); break;
      case '--count': countPerSpecies = parseInt(args[++i], 10); break;
      case '--world-size': {
        const [w, h] = args[++i].split('x').map(Number);
        worldSize = { width: w, height: h };
        break;
      }
      case '--corrupt-at-tick': corruptAtTick = parseInt(args[++i], 10); break;
      case '--corrupt-count': corruptCount = parseInt(args[++i], 10); break;
      case '--corrupt-target': corruptTargetId = args[++i]; break;
      case '--corrupt-seed': corruptSeed = parseInt(args[++i], 10); break;
      case '--corrupt-periodic': corruptPeriodic = parseInt(args[++i], 10); break;
    }
  }

  const corruption: CorruptionOpts | null = corruptAtTick >= 0 && corruptCount > 0
    ? { atTick: corruptAtTick, count: corruptCount, targetId: corruptTargetId, seed: corruptSeed, periodic: corruptPeriodic }
    : null;

  return { ticks, programPaths, output, seed, worldSize, countPerSpecies, corruption };
}

function loadProgramDefinition(path: string, count: number): ProgramDefinition {
  const json = JSON.parse(readFileSync(path, 'utf-8'));
  const name: string = json.name ?? 'Unknown';
  const components: ComponentType[] = json.components ?? [
    'Frame', 'Frame', 'Frame', 'Actuator', 'Harvester',
    'Charger', 'Assembler', 'Processor', 'Sensor', 'MemoryCore',
  ];
  const program: number[] = json.program ?? [];
  return { name, components, program, count };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.programPaths.length === 0) {
    console.error('Usage: tsx src/cli.ts --program <path.json> [--program <path2.json>] [--ticks N] [--seed N] [--count N] [--output tick|final|events]');
    process.exit(1);
  }

  const definitions = opts.programPaths.map(p => loadProgramDefinition(p, opts.countPerSpecies));
  const params = DEFAULT_GAME_PARAMS;
  const engine = createEngine(params);
  const rng = createRng(opts.seed);

  const config: WorldConfig = {
    ...DEFAULT_WORLD_CONFIG,
    ...(opts.worldSize ? { width: opts.worldSize.width, height: opts.worldSize.height } : {}),
  };

  let world = engine.createWorld(config, rng);
  world = engine.spawnInitialCharacters(world, definitions, rng);

  console.error(`v5 simulation: ${definitions.map(d => `${d.name}x${d.count}`).join(', ')}`);
  console.error(`World: ${world.width}x${world.height}, ${world.characters.length} characters, ${world.resourceNodes.length} nodes`);
  if (opts.corruption) {
    console.error(`Corruption: ${opts.corruption.count} words at tick ${opts.corruption.atTick}` +
      (opts.corruption.periodic > 0 ? ` (periodic every ${opts.corruption.periodic} ticks)` : ''));
  }

  // Run tick by tick so we can inject corruption mid-simulation
  let currentWorld = world;
  const allEvents = [];
  let corruptionTriggered = false;
  let corruptSeedCounter = opts.corruption?.seed ?? 0;

  for (let i = 0; i < opts.ticks; i++) {
    // Inject corruption at the configured tick (one-time or periodic)
    const corr = opts.corruption;
    if (corr) {
      const periodicHit = corr.periodic > 0
        && currentWorld.tick >= corr.atTick
        && (currentWorld.tick - corr.atTick) % corr.periodic === 0;
      const oneTimeHit = corr.periodic === 0 && currentWorld.tick === corr.atTick && !corruptionTriggered;
      if (periodicHit || oneTimeHit) {
        const targetId = corr.targetId
          ?? currentWorld.characters.find((c) => c.vm.active)?.id
          ?? null;
        if (targetId) {
          const before = currentWorld;
          currentWorld = corruptCharacterMemory(currentWorld, targetId, corr.count, corruptSeedCounter);
          corruptSeedCounter++;
          if (currentWorld !== before) {
            console.error(`[tick ${currentWorld.tick}] Corrupted ${corr.count} words in character ${targetId}`);
          }
        }
        corruptionTriggered = true;
      }
    }

    const result = engine.executeTick(currentWorld);
    currentWorld = result.world;
    allEvents.push(...result.events);

    if (opts.output === 'tick') {
      const charCount = result.world.characters.length;
      const speciesCounts: Record<string, number> = {};
      for (const c of result.world.characters) {
        speciesCounts[c.species] = (speciesCounts[c.species] ?? 0) + 1;
      }
      console.log(JSON.stringify({
        tick: result.world.tick,
        characters: charCount,
        species: speciesCounts,
        events: result.events.length,
        instructionLimitHits: result.instructionLimitHits.size,
        checkpointHits: result.checkpointHits.size,
        reflexHits: result.reflexHits.size,
        apoptosisDeaths: result.apoptosisDeaths.size,
      }));
    } else if (opts.output === 'events') {
      for (const e of result.events) {
        if (e.type === 'character_spawned') {
          console.log(`[tick ${result.world.tick}] ${e.parentId} spawned ${e.childId}`);
        } else {
          console.log(`[tick ${result.world.tick}] ${e.id} died`);
        }
      }
    }

    if (currentWorld.characters.length === 0) break;
  }
  const finalWorld = currentWorld;

  if (opts.output === 'final') {
    const speciesCounts: Record<string, number> = {};
    for (const c of finalWorld.characters) {
      speciesCounts[c.species] = (speciesCounts[c.species] ?? 0) + 1;
    }
    console.log(JSON.stringify({
      tick: finalWorld.tick,
      characters: finalWorld.characters.length,
      species: speciesCounts,
      resourceNodes: finalWorld.resourceNodes.length,
      energyNodes: finalWorld.energyNodes.length,
      remains: finalWorld.remains.length,
      births: allEvents.filter(e => e.type === 'character_spawned').length,
      deaths: allEvents.filter(e => e.type === 'character_died').length,
    }, null, 2));
  }
}

main();
