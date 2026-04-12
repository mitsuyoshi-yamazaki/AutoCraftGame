import type { Action, Character, SimulationEvent, TickResult, World } from './types.js';
import type { GameParams } from './params.js';
import type { CharacterEngine } from './character.js';
import { isActive, isDead } from './character.js';
import type { ProgramEngine } from './program.js';
import type { ActionEngine } from './actions.js';
import type { PhysicsEngine } from './physics.js';
import { createForceMap } from './physics.js';
import {
  produceEnergy,
  removeCharacter,
  addRemains,
  createRemains,
  nextObjectId,
} from './world.js';
import { buildGrid } from './spatial-grid.js';
import { absorbOldRemains, regenerateNodes } from './ground.js';

// ============================================================
// SimulationEngine — param-dependent functions (maker pattern)
// ============================================================
export interface SimulationEngine {
  executeTick(world: World): TickResult;
  runSimulation(initialWorld: World, ticks: number, onTick?: (result: TickResult) => void): { world: World; allEvents: SimulationEvent[] };
}

export interface SimulationEngineDeps {
  characterEngine: CharacterEngine;
  programEngine: ProgramEngine;
  actionEngine: ActionEngine;
  physicsEngine: PhysicsEngine;
}

export function createSimulationEngine(
  params: GameParams,
  deps: SimulationEngineDeps,
): SimulationEngine {
  const { characterEngine, programEngine, actionEngine, physicsEngine } = deps;

  function executeTick(world: World): TickResult {
    const allEvents: SimulationEvent[] = [];

    // Step 1: EnergyNode production (MUTABLE)
    produceEnergy(world);

    // Build spatial grid for this tick (used in steps 2-5)
    const grid = buildGrid(world, params.senseRange);

    // Step 2: Determine actions for all active characters (+ apply set_registers)
    const decisions: { characterId: string; action: Action }[] = [];
    for (const character of world.characters) {
      if (!isActive(character) || !character.program) continue;
      const { action } = programEngine.evaluateProgram(
        character.program, character, world, grid,
      );
      decisions.push({ characterId: character.id, action });
    }

    // Step 3: Execute all actions (MUTABLE)
    const forces = createForceMap();
    for (const { characterId, action } of decisions) {
      const result = actionEngine.executeAction(world, characterId, action, forces, grid);
      allEvents.push(...result.events);
    }

    // Step 4: Friction forces
    physicsEngine.computeFrictionForces(world, forces);

    // Step 5: Collision detection and response
    physicsEngine.computeCollisionForces(world, forces, grid);

    // Step 6: Physics integration (MUTABLE: velocity + position update)
    physicsEngine.integratePhysics(world, forces);

    // Step 7+8: Basal metabolism and durability decay (MUTABLE)
    for (const c of world.characters) {
      const starving = !characterEngine.canPayMetabolism(c, world.tick);
      characterEngine.applyBasalMetabolism(c, world.tick);
      characterEngine.decayDurability(c, starving);
    }

    // Step 9: Death check — create remains and remove dead (MUTABLE)
    const deadIds: string[] = [];
    for (const character of world.characters) {
      if (isDead(character)) {
        deadIds.push(character.id);
        allEvents.push({ type: 'character_died', id: character.id });
        const remainsId = nextObjectId(world);
        const remains = createRemains(
          remainsId, character.position, character.components,
          character.inventory, world.tick,
        );
        addRemains(world, remains);
      }
    }
    for (const id of deadIds) {
      removeCharacter(world, id);
    }

    // Step 10: Remains absorption into ground grid (MUTABLE)
    absorbOldRemains(world, params);

    // Step 11: Resource node regeneration from ground grid (MUTABLE)
    regenerateNodes(world, params);

    // Step 12: Increment tick
    world.tick++;

    const actions = new Map<string, Action>(decisions.map((d) => [d.characterId, d.action]));
    return { world, events: allEvents, actions };
  }

  function runSimulation(
    initialWorld: World,
    ticks: number,
    onTick?: (result: TickResult) => void,
  ): { world: World; allEvents: SimulationEvent[] } {
    const world = initialWorld;
    const allEvents: SimulationEvent[] = [];

    for (let i = 0; i < ticks; i++) {
      const result = executeTick(world);
      allEvents.push(...result.events);
      if (onTick) onTick(result);

      if (world.characters.length === 0) break;
    }

    return { world, allEvents };
  }

  return { executeTick, runSimulation };
}
