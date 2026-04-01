import { readFileSync } from 'fs';
import type { Program } from './types.js';
import { createCharacter } from './character.js';
import { MIN_COMPONENTS } from './recipes.js';
import { createWorld, createRng, findNearestUnoccupied, addCharacter } from './world.js';
import type { WorldConfig } from './world.js';
import { DEFAULT_WORLD_CONFIG } from './world.js';
import { runSimulation } from './simulation.js';

// ============================================================
// Parse CLI arguments
// ============================================================
function parseArgs(args: string[]) {
  let ticks = 100;
  let programPath: string | null = null;
  let mapWidth = 20;
  let mapHeight = 20;
  let output: 'tick' | 'final' | 'events' = 'final';
  let initialEnergy = 5000;
  let energyNodes = 8;
  let nodeRemaining = 50;
  let seed = 42;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticks':
        ticks = parseInt(args[++i], 10);
        break;
      case '--program':
        programPath = args[++i];
        break;
      case '--map-size': {
        const [w, h] = args[++i].split('x').map(Number);
        mapWidth = w;
        mapHeight = h;
        break;
      }
      case '--output':
        output = args[++i] as 'tick' | 'final' | 'events';
        break;
      case '--initial-energy':
        initialEnergy = parseInt(args[++i], 10);
        break;
      case '--energy-nodes':
        energyNodes = parseInt(args[++i], 10);
        break;
      case '--node-remaining':
        nodeRemaining = parseInt(args[++i], 10);
        break;
      case '--seed':
        seed = parseInt(args[++i], 10);
        break;
    }
  }

  return { ticks, programPath, mapWidth, mapHeight, output, initialEnergy, energyNodes, nodeRemaining, seed };
}

// ============================================================
// Main
// ============================================================
function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.programPath) {
    console.error('Usage: tsx src/cli.ts --program <path> [--ticks N] [--map-size WxH] [--output tick|final|events]');
    process.exit(1);
  }

  const programJson = readFileSync(opts.programPath, 'utf-8');
  const program: Program = JSON.parse(programJson);

  const config: WorldConfig = {
    ...DEFAULT_WORLD_CONFIG,
    width: opts.mapWidth,
    height: opts.mapHeight,
    energyNodeCount: opts.energyNodes,
    nodeRemaining: opts.nodeRemaining,
  };

  const rng = createRng(opts.seed);
  let world = createWorld(config, rng);

  // Place initial character near center
  const center = { x: Math.floor(config.width / 2), y: Math.floor(config.height / 2) };
  const charPos = findNearestUnoccupied(world, center);
  const { id, world: worldWithId } = (() => {
    const cid = `char-${String(world.nextCharacterId).padStart(3, '0')}`;
    return { id: cid, world: { ...world, nextCharacterId: world.nextCharacterId + 1 } };
  })();
  world = worldWithId;

  const initialChar = createCharacter(id, charPos, MIN_COMPONENTS, program, opts.initialEnergy);
  world = addCharacter(world, initialChar);

  const { world: finalWorld, allEvents } = runSimulation(world, opts.ticks, (result) => {
    if (opts.output === 'tick') {
      console.log(JSON.stringify({
        tick: result.world.tick,
        characters: result.world.characters.map(summarizeCharacter),
        resourceNodeCount: result.world.resourceNodes.length,
        energyNodes: result.world.energyNodes.map(summarizeEnergyNode),
        remainsCount: result.world.remains.length,
        events: result.events,
      }));
    }
  });

  if (opts.output === 'final') {
    console.log(JSON.stringify({
      tick: finalWorld.tick,
      characters: finalWorld.characters.map(summarizeCharacter),
      resourceNodes: finalWorld.resourceNodes.length,
      energyNodes: finalWorld.energyNodes.map(summarizeEnergyNode),
      remains: finalWorld.remains.length,
      events: allEvents,
    }, null, 2));
  } else if (opts.output === 'events') {
    for (const event of allEvents) {
      console.log(JSON.stringify(event));
    }
  }
}

function summarizeCharacter(c: import('./types.js').Character) {
  return {
    id: c.id,
    position: c.position,
    durability: c.durability,
    energy: c.energy,
    inventory: c.inventory,
    components: c.components,
  };
}

function summarizeEnergyNode(n: import('./types.js').EnergyNode) {
  return {
    position: n.position,
    stored: n.stored,
  };
}

main();
