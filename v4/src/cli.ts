import { readFileSync } from 'fs';
import type { ComponentType, ProgramDefinition } from './types.js';
import { createRng } from './world.js';
import type { WorldConfig } from './world.js';
import { DEFAULT_WORLD_CONFIG } from './world.js';
import { createEngine } from './engine.js';
import { DEFAULT_GAME_PARAMS } from './params.js';

function parseArgs(args: string[]) {
  let ticks = 100;
  let programPaths: string[] = [];
  let output: 'tick' | 'final' | 'events' = 'final';
  let seed = 42;
  let worldSize: { width: number; height: number } | null = null;
  let countPerSpecies = 3;

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
    }
  }

  return { ticks, programPaths, output, seed, worldSize, countPerSpecies };
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

  console.error(`v4 simulation: ${definitions.map(d => `${d.name}x${d.count}`).join(', ')}`);
  console.error(`World: ${world.width}x${world.height}, ${world.characters.length} characters, ${world.resourceNodes.length} nodes`);

  const { world: finalWorld, allEvents } = engine.runSimulation(world, opts.ticks, (result) => {
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
  });

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
