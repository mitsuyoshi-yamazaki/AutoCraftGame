/**
 * Simulation Loop — orchestrates a single tick of the v8 world.
 *
 * Tick order:
 * 1. Processor execution (object ID order)
 * 2. Component action phase (DISCONNECT triggers, Assembler ASSEMBLE progression)
 * 3. Random movement (groups move as single rigid bodies; free objects individually)
 * 4. Wall boundary correction
 * 5. tick++
 */

import type {
  World,
  TickResult,
  SimulationEvent,
  AssemblerObject,
  ProcessorObject,
  GroupObject,
  WorldObject,
} from './types.js';
import {
  ASM_OFF_DISCONNECT_TRIGGER,
  ASM_OFF_DISCONNECT_TARGET_ID,
  PROC_OFF_DISCONNECT_TRIGGER,
  PROC_OFF_DISCONNECT_TARGET_ID,
} from './types.js';
import type { GameParams } from './params.js';
import { executeProcessorTick } from './processor.js';
import { executeAssemblerTick } from './assembler.js';
import { disconnectEdge, replaceObject, getObject } from './world.js';

// ============================================================
// Simulation
// ============================================================
export function executeTick(world: World, params: GameParams): TickResult {
  let currentWorld = world;
  const events: SimulationEvent[] = [];

  // Step 1: Processor execution (ID order)
  const processors = currentWorld.objects
    .filter((o): o is ProcessorObject => o.kind === 'processor' && o.running)
    .sort((a, b) => a.id - b.id);

  for (const proc of processors) {
    const result = executeProcessorTick(currentWorld, proc.id, params);
    currentWorld = result.world;
  }

  // Step 2: Component action phase
  // 2-1: Processor DISCONNECT triggers
  const procIds = currentWorld.objects
    .filter((o): o is ProcessorObject => o.kind === 'processor')
    .map(p => p.id)
    .sort((a, b) => a - b);
  for (const pid of procIds) {
    const p = getObject(currentWorld, pid) as ProcessorObject | undefined;
    if (!p) continue;
    if (p.operationMemory[PROC_OFF_DISCONNECT_TRIGGER] === 1) {
      const target = p.operationMemory[PROC_OFF_DISCONNECT_TARGET_ID];
      if (target !== 0) {
        const res = disconnectEdge(currentWorld, pid, target);
        currentWorld = res.world;
        if (res.applied) events.push({ type: 'disconnect_applied', actorId: pid, targetId: target });
      }
      // Clear trigger
      const pp = getObject(currentWorld, pid) as ProcessorObject | undefined;
      if (pp) {
        const mem = [...pp.operationMemory];
        mem[PROC_OFF_DISCONNECT_TRIGGER] = 0;
        currentWorld = replaceObject(currentWorld, { ...pp, operationMemory: mem });
      }
    }
  }

  // 2-2: Assembler DISCONNECT triggers
  const asmIds = currentWorld.objects
    .filter((o): o is AssemblerObject => o.kind === 'assembler')
    .map(a => a.id)
    .sort((a, b) => a - b);
  for (const aid of asmIds) {
    const a = getObject(currentWorld, aid) as AssemblerObject | undefined;
    if (!a) continue;
    if (a.operationMemory[ASM_OFF_DISCONNECT_TRIGGER] === 1) {
      const target = a.operationMemory[ASM_OFF_DISCONNECT_TARGET_ID];
      if (target !== 0) {
        const res = disconnectEdge(currentWorld, aid, target);
        currentWorld = res.world;
        if (res.applied) events.push({ type: 'disconnect_applied', actorId: aid, targetId: target });
      }
      const aa = getObject(currentWorld, aid) as AssemblerObject | undefined;
      if (aa) {
        const mem = [...aa.operationMemory];
        mem[ASM_OFF_DISCONNECT_TRIGGER] = 0;
        currentWorld = replaceObject(currentWorld, { ...aa, operationMemory: mem });
      }
    }
  }

  // 2-3: Assembler ASSEMBLE processing
  const asmIds2 = currentWorld.objects
    .filter((o): o is AssemblerObject => o.kind === 'assembler')
    .map(a => a.id)
    .sort((a, b) => a - b);
  for (const aid of asmIds2) {
    const result = executeAssemblerTick(currentWorld, aid, params);
    currentWorld = result.world;
    events.push(...result.events);
  }

  // Step 3: Random movement
  currentWorld = applyRandomMovement(currentWorld, params);

  // Step 4: Wall boundary correction
  currentWorld = correctBoundaries(currentWorld);

  // Step 5: tick++
  currentWorld = { ...currentWorld, tick: currentWorld.tick + 1 };

  return { world: currentWorld, events };
}

function applyRandomMovement(world: World, params: GameParams): World {
  const r = params.randomMovementRange;
  const objects = world.objects.map(obj => {
    // Members of a group do not move individually (they live at (0,0) local)
    if ((obj.kind === 'assembler' || obj.kind === 'processor') && obj.groupId !== null) {
      return obj;
    }
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
    // Members of a group inherit group position
    if ((obj.kind === 'assembler' || obj.kind === 'processor') && obj.groupId !== null) {
      return obj;
    }
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
