/**
 * Simulation Loop — orchestrates a single tick of the v7 world.
 *
 * Tick order:
 * 1. Processor execution (object ID order)
 * 2. Assembler processing (trigger check, gathering, assembling, ejection)
 * 3. Random movement (all objects)
 * 4. Wall boundary correction
 * 5. tick++
 */

import type {
  World,
  WorldObject,
  TickResult,
  SimulationEvent,
  AssemblerObject,
  ProcessorObject,
} from './types.js';
import type { GameParams } from './params.js';
import { executeProcessorTick } from './processor.js';
import { executeAssemblerTick } from './assembler.js';

// ============================================================
// Simulation
// ============================================================
export function executeTick(world: World, params: GameParams): TickResult {
  let currentWorld = world;
  const events: SimulationEvent[] = [];

  // Step 1: Processor execution (ID order)
  const processors = currentWorld.objects
    .filter((o): o is ProcessorObject => o.kind === 'processor' && o.running)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const proc of processors) {
    const result = executeProcessorTick(currentWorld, proc.id, params);
    currentWorld = result.world;
  }

  // Step 2: Assembler processing
  const assemblers = currentWorld.objects
    .filter((o): o is AssemblerObject => o.kind === 'assembler');

  for (const asm of assemblers) {
    const result = executeAssemblerTick(currentWorld, asm.id, params);
    currentWorld = result.world;
    events.push(...result.events);
  }

  // Step 2.5: Clear action_trigger for all components (offset 1)
  currentWorld = clearAllActionTriggers(currentWorld);

  // Step 3: Random movement
  currentWorld = applyRandomMovement(currentWorld, params);

  // Step 4: Wall boundary correction
  currentWorld = correctBoundaries(currentWorld);

  // Step 5: tick++
  currentWorld = { ...currentWorld, tick: currentWorld.tick + 1 };

  return { world: currentWorld, events };
}

function clearAllActionTriggers(world: World): World {
  const objects = world.objects.map(obj => {
    if (obj.kind === 'assembler' || obj.kind === 'processor') {
      const mem = [...obj.operationMemory];
      if (mem[1] !== 0) {
        mem[1] = 0;  // action_trigger at offset 1
        return { ...obj, operationMemory: mem };
      }
    }
    return obj;
  });
  return { ...world, objects };
}

function applyRandomMovement(world: World, params: GameParams): World {
  const r = params.randomMovementRange;
  const objects = world.objects.map(obj => {
    const angle = Math.random() * 2 * Math.PI;
    const dist = Math.random() * r;
    return {
      ...obj,
      position: {
        x: obj.position.x + Math.cos(angle) * dist,
        y: obj.position.y + Math.sin(angle) * dist,
      },
    };
  });
  return { ...world, objects };
}

function correctBoundaries(world: World): World {
  const objects = world.objects.map(obj => {
    let { x, y } = obj.position;
    const margin = 0.1;
    if (x < 0) x = margin;
    if (y < 0) y = margin;
    if (x > world.width) x = world.width - margin;
    if (y > world.height) y = world.height - margin;
    if (x === obj.position.x && y === obj.position.y) return obj;
    return { ...obj, position: { x, y } };
  });
  return { ...world, objects };
}

// ============================================================
// Run multiple ticks
// ============================================================
export function runSimulation(
  world: World,
  params: GameParams,
  ticks: number,
  onTick?: (result: TickResult) => void,
): { world: World; allEvents: SimulationEvent[] } {
  let w = world;
  const allEvents: SimulationEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const result = executeTick(w, params);
    w = result.world;
    allEvents.push(...result.events);
    if (onTick) onTick(result);
  }
  return { world: w, allEvents };
}
