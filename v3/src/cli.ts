import { readFileSync } from 'fs';
import type { Program, ComponentType } from './types.js';
import { MIN_COMPONENTS } from './recipes.js';
import { createRng, addCharacter } from './world.js';
import type { WorldConfig } from './world.js';
import { DEFAULT_WORLD_CONFIG } from './world.js';
import { createEngine } from './engine.js';
import { DEFAULT_GAME_PARAMS } from './params.js';
import { deserialize } from './save-load.js';

// ============================================================
// Parse CLI arguments
// ============================================================
function parseArgs(args: string[]) {
  let ticks = 100;
  let programPath: string | null = null;
  let loadPath: string | null = null;
  let output: 'tick' | 'final' | 'events' = 'final';
  let initialEnergy = 5000;
  let seed = 42;
  let worldSize: { width: number; height: number } | null = null;
  let energyNodeCount: number | null = null;
  let nodeRemaining: number | null = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticks': ticks = parseInt(args[++i], 10); break;
      case '--program': programPath = args[++i]; break;
      case '--load': loadPath = args[++i]; break;
      case '--output': output = args[++i] as 'tick' | 'final' | 'events'; break;
      case '--initial-energy': initialEnergy = parseInt(args[++i], 10); break;
      case '--seed': seed = parseInt(args[++i], 10); break;
      case '--world-size': {
        const [w, h] = args[++i].split('x').map(Number);
        worldSize = { width: w, height: h };
        break;
      }
      case '--energy-nodes': energyNodeCount = parseInt(args[++i], 10); break;
      case '--node-remaining': nodeRemaining = parseInt(args[++i], 10); break;
    }
  }

  return { ticks, programPath, loadPath, output, initialEnergy, seed, worldSize, energyNodeCount, nodeRemaining };
}

// ============================================================
// Main
// ============================================================
function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.loadPath && opts.programPath) {
    console.error('Error: --load and --program are mutually exclusive');
    process.exit(1);
  }

  if (!opts.programPath && !opts.loadPath) {
    console.error('Usage: tsx src/cli.ts --program <path> [--ticks N] [--seed N] [--output tick|final|events]');
    console.error('       tsx src/cli.ts --load <save-file> [--ticks N] [--output tick|final|events]');
    process.exit(1);
  }

  // Load mode
  if (opts.loadPath) {
    const json = readFileSync(opts.loadPath, 'utf-8');
    const saveData = deserialize(json);
    const engine = createEngine(saveData.params);

    const { world: finalWorld, allEvents } = engine.runSimulation(saveData.world, opts.ticks, (result) => {
      if (opts.output === 'tick') {
        console.log(JSON.stringify({
          tick: result.world.tick,
          characters: result.world.characters.length,
          resourceNodes: result.world.resourceNodes.length,
          events: result.events,
        }));
      }
    });

    outputResults(opts.output, finalWorld, allEvents);
    return;
  }

  // Program mode
  const programJson = readFileSync(opts.programPath!, 'utf-8');
  const parsed = JSON.parse(programJson);
  const rules = parsed.rules.map((r: any) => ({
    condition: r.condition,
    action: r.action,
    ...(r.set_registers ? { set_registers: r.set_registers } : {}),
  }));
  const components: ComponentType[] = parsed.components ?? [...MIN_COMPONENTS];
  const species = parsed.name ?? 'Unknown';
  const program: Program = { name: species, rules };

  const config: WorldConfig = {
    ...DEFAULT_WORLD_CONFIG,
    ...(opts.worldSize ? { width: opts.worldSize.width, height: opts.worldSize.height } : {}),
    ...(opts.energyNodeCount !== null ? { energyNodeCount: opts.energyNodeCount } : {}),
    ...(opts.nodeRemaining !== null ? { nodeRemaining: opts.nodeRemaining } : {}),
  };
  const engine = createEngine(DEFAULT_GAME_PARAMS);
  const rng = createRng(opts.seed);
  let world = engine.createWorld(config, rng);

  // Place initial character near center
  const centerPos = { x: config.width / 2, y: config.height / 2 };
  const id = `char-${String(world.nextCharacterId).padStart(3, '0')}`;
  world = { ...world, nextCharacterId: world.nextCharacterId + 1 };
  const initialChar = engine.createCharacter(id, centerPos, components, program, opts.initialEnergy, species, 0);
  world = addCharacter(world, initialChar);

  const { world: finalWorld, allEvents } = engine.runSimulation(world, opts.ticks, (result) => {
    if (opts.output === 'tick') {
      console.log(JSON.stringify({
        tick: result.world.tick,
        characters: result.world.characters.length,
        resourceNodes: result.world.resourceNodes.length,
        events: result.events,
      }));
    }
  });

  outputResults(opts.output, finalWorld, allEvents);
}

function outputResults(output: string, finalWorld: any, allEvents: any[]) {
  if (output === 'final') {
    console.log(JSON.stringify({
      tick: finalWorld.tick,
      characters: finalWorld.characters.map((c: any) => ({
        id: c.id,
        position: c.position,
        velocity: c.velocity,
        durability: c.durability,
        energy: c.energy,
        components: c.components,
        inventory: c.inventory,
      })),
      resourceNodes: finalWorld.resourceNodes.length,
      energyNodes: finalWorld.energyNodes.length,
      remains: finalWorld.remains.length,
    }, null, 2));
  } else if (output === 'events') {
    for (const event of allEvents) {
      console.log(JSON.stringify(event));
    }
  }
}

main();
