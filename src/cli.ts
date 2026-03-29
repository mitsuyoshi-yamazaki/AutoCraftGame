import { readFileSync } from 'node:fs';
import type { Program, SimulationEvent, World } from './types.js';
import { createWorld, addCharacter, nextCharacterId } from './world.js';
import { createCharacter } from './character.js';
import { MIN_COMPONENTS } from './recipes.js';
import { executeTick } from './simulation.js';

// ============================================================
// Parse CLI arguments
// ============================================================
interface CliOptions {
  ticks: number;
  programPath: string | null;
  mapWidth: number;
  mapHeight: number;
  output: 'tick' | 'final' | 'events';
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    ticks: 100,
    programPath: null,
    mapWidth: 20,
    mapHeight: 20,
    output: 'final',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ticks':
        options.ticks = parseInt(args[++i], 10);
        break;
      case '--program':
        options.programPath = args[++i];
        break;
      case '--map-size': {
        const [w, h] = args[++i].split('x').map(Number);
        options.mapWidth = w;
        options.mapHeight = h;
        break;
      }
      case '--output':
        options.output = args[++i] as CliOptions['output'];
        break;
    }
  }

  return options;
}

// ============================================================
// Load program from JSON file
// ============================================================
function loadProgram(path: string): Program {
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw);
  // Strip comment fields from rules (not part of the type)
  const rules = parsed.rules.map((r: any) => ({
    condition: r.condition,
    action: r.action,
  }));
  return { rules };
}

// ============================================================
// Format tick output
// ============================================================
function formatTick(world: World, events: readonly SimulationEvent[]) {
  return {
    tick: world.tick,
    characters: world.characters.map((c) => ({
      id: c.id,
      position: c.position,
      durability: c.durability,
      inventory: c.inventory,
      components: c.components,
    })),
    events,
  };
}

// ============================================================
// Main
// ============================================================
function main() {
  const options = parseArgs(process.argv.slice(2));

  // Create world
  let world = createWorld(options.mapWidth, options.mapHeight);

  // Load and place initial character
  if (options.programPath) {
    const program = loadProgram(options.programPath);
    const { id, world: w2 } = nextCharacterId(world);
    world = w2;
    // Place at center of map
    const startPos = { x: Math.floor(options.mapWidth / 2), y: Math.floor(options.mapHeight / 2) };
    const character = createCharacter(id, startPos, [...MIN_COMPONENTS], program);
    world = addCharacter(world, character);
  }

  // Run simulation
  const allEvents: SimulationEvent[] = [];

  for (let i = 0; i < options.ticks; i++) {
    const result = executeTick(world);
    world = result.world;
    allEvents.push(...result.events);

    if (options.output === 'tick') {
      console.log(JSON.stringify(formatTick(world, result.events)));
    }

    if (world.characters.length === 0) break;
  }

  // Final output
  if (options.output === 'final') {
    console.log(JSON.stringify(formatTick(world, allEvents), null, 2));
  } else if (options.output === 'events') {
    console.log(JSON.stringify({ events: allEvents }, null, 2));
  }
}

main();
