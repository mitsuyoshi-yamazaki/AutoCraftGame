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
  updateCharacter,
  addRemains,
  createRemains,
  nextObjectId,
} from './world.js';
import { buildGrid } from './spatial-grid.js';

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
    let currentWorld = world;
    const allEvents: SimulationEvent[] = [];

    // Step 1: EnergyNode production
    currentWorld = produceEnergy(currentWorld);

    // Build spatial grid for this tick (used in steps 2-5)
    const grid = buildGrid(currentWorld, params.senseRange);

    // Step 2: Determine actions for all active characters (+ apply set_registers)
    const decisions: { characterId: string; action: Action }[] = [];
    for (const character of currentWorld.characters) {
      if (!isActive(character) || !character.program) continue;
      const { action, character: updated } = programEngine.evaluateProgram(character.program, character, currentWorld, grid);
      currentWorld = updateCharacter(currentWorld, updated);
      decisions.push({ characterId: character.id, action });
    }

    // Step 3: Execute all actions
    const forces = createForceMap();
    for (const { characterId, action } of decisions) {
      const result = actionEngine.executeAction(currentWorld, characterId, action, forces, grid);
      currentWorld = result.world;
      allEvents.push(...result.events);
    }

    // Step 4: Friction forces
    physicsEngine.computeFrictionForces(currentWorld, forces);

    // Step 5: Collision detection and response
    physicsEngine.computeCollisionForces(currentWorld, forces, grid);

    // Step 6: Physics integration (velocity + position update)
    currentWorld = physicsEngine.integratePhysics(currentWorld, forces);

    // Step 7+8: Basal metabolism and durability decay
    currentWorld = {
      ...currentWorld,
      characters: currentWorld.characters.map((c) => {
        const starving = !characterEngine.canPayMetabolism(c);
        const afterMetabolism = characterEngine.applyBasalMetabolism(c);
        return characterEngine.decayDurability(afterMetabolism, starving);
      }),
    };

    // Step 9: Death check — create remains and remove dead characters
    const deadIds: string[] = [];
    for (const character of currentWorld.characters) {
      if (isDead(character)) {
        deadIds.push(character.id);
        allEvents.push({ type: 'character_died', id: character.id });
        const { id: remainsId, world: w } = nextObjectId(currentWorld);
        currentWorld = w;
        const remains = createRemains(remainsId, character.position, character.components, character.inventory);
        currentWorld = addRemains(currentWorld, remains);
      }
    }
    for (const id of deadIds) {
      currentWorld = removeCharacter(currentWorld, id);
    }

    // Step 10: Increment tick
    currentWorld = { ...currentWorld, tick: currentWorld.tick + 1 };

    const actions = new Map<string, Action>(decisions.map((d) => [d.characterId, d.action]));
    return { world: currentWorld, events: allEvents, actions };
  }

  function runSimulation(
    initialWorld: World,
    ticks: number,
    onTick?: (result: TickResult) => void,
  ): { world: World; allEvents: SimulationEvent[] } {
    let world = initialWorld;
    const allEvents: SimulationEvent[] = [];

    for (let i = 0; i < ticks; i++) {
      const result = executeTick(world);
      world = result.world;
      allEvents.push(...result.events);
      if (onTick) onTick(result);

      if (world.characters.length === 0) break;
    }

    return { world, allEvents };
  }

  return { executeTick, runSimulation };
}
