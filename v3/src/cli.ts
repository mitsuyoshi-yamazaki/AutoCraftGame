import { readFileSync } from 'fs';
import type { Program, ComponentType } from './types.js';
import { createCharacter } from './character.js';
import { MIN_COMPONENTS } from './recipes.js';
import { createWorld, createRng, nextCharacterId as getNextCharId } from './world.js';
import type { WorldConfig } from './world.js';
import { DEFAULT_WORLD_CONFIG } from './world.js';
import { runSimulation } from './simulation.js';
import { CHARACTER_RADIUS } from './constants.js';

// ============================================================
// Parse CLI arguments
// ============================================================
function parseArgs(args: string[]) {
  let ticks = 100;
  let programPath: string | null = null;
  let output: 'tick' | 'final' | 'events' = 'final';
  let initialEnergy = 5000;
  let seed = 42;
  const configOverrides: Partial<WorldConfig> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticks': ticks = parseInt(args[++i], 10); break;
      case '--program': programPath = args[++i]; break;
      case '--output': output = args[++i] as 'tick' | 'final' | 'events'; break;
      case '--initial-energy': initialEnergy = parseInt(args[++i], 10); break;
      case '--seed': seed = parseInt(args[++i], 10); break;
      case '--world-size': {
        const [w, h] = args[++i].split('x').map(Number);
        configOverrides.width = w;
        configOverrides.height = h;
        break;
      }
      case '--energy-nodes': configOverrides.energyNodeCount = parseInt(args[++i], 10); break;
      case '--node-remaining': configOverrides.nodeRemaining = parseInt(args[++i], 10); break;
    }
  }

  return { ticks, programPath, output, initialEnergy, seed, configOverrides };
}

// ============================================================
// Main
// ============================================================
function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.programPath) {
    console.error('Usage: tsx src/cli.ts --program <path> [--ticks N] [--seed N] [--output tick|final|events]');
    process.exit(1);
  }

  const programJson = readFileSync(opts.programPath, 'utf-8');
  const parsed = JSON.parse(programJson);
  const rules = parsed.rules.map((r: any) => ({
    condition: r.condition,
    action: r.action,
    ...(r.set_registers ? { set_registers: r.set_registers } : {}),
  }));
  const components: ComponentType[] = parsed.components ?? [...MIN_COMPONENTS];
  const species = parsed.name ?? 'Unknown';
  const program: Program = { name: species, rules };

  const config: WorldConfig = { ...DEFAULT_WORLD_CONFIG, ...opts.configOverrides };
  const rng = createRng(opts.seed);
  let world = createWorld(config, rng);

  // Place initial character near center
  const centerPos = { x: config.width / 2, y: config.height / 2 };
  const { id, world: worldWithId } = getNextCharId(world);
  world = worldWithId;
  const initialChar = createCharacter(id, centerPos, components, program, opts.initialEnergy, species);
  world = { ...world, characters: [...world.characters, initialChar] };

  const { world: finalWorld, allEvents } = runSimulation(world, opts.ticks, (result) => {
    if (opts.output === 'tick') {
      console.log(JSON.stringify({
        tick: result.world.tick,
        characters: result.world.characters.length,
        resourceNodes: result.world.resourceNodes.length,
        events: result.events,
      }));
    }
  });

  if (opts.output === 'final') {
    console.log(JSON.stringify({
      tick: finalWorld.tick,
      characters: finalWorld.characters.map((c) => ({
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
  } else if (opts.output === 'events') {
    for (const event of allEvents) {
      console.log(JSON.stringify(event));
    }
  }
}

main();
