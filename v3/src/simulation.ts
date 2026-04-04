import type { Action, Character, SimulationEvent, TickResult, World } from './types.js';
import { applyBasalMetabolism, canPayMetabolism, decayDurability, isDead, isActive } from './character.js';
import { evaluateProgram } from './program.js';
import { executeAction } from './actions.js';
import {
  produceEnergy,
  removeCharacter,
  updateCharacter,
  addRemains,
  createRemains,
  nextObjectId,
} from './world.js';
import {
  createForceMap,
  computeFrictionForces,
  computeCollisionForces,
  integratePhysics,
} from './physics.js';

// ============================================================
// Single tick execution (v3: 10-step game loop)
// ============================================================
export function executeTick(world: World): TickResult {
  let currentWorld = world;
  const allEvents: SimulationEvent[] = [];

  // Step 1: EnergyNode production
  currentWorld = produceEnergy(currentWorld);

  // Step 2: Determine actions for all active characters
  const decisions: { characterId: string; action: Action; context: any }[] = [];
  for (const character of currentWorld.characters) {
    if (!isActive(character) || !character.program) continue;
    const { action, context } = evaluateProgram(character.program, character, currentWorld);
    decisions.push({ characterId: character.id, action, context });
  }

  // Step 3: Execute all actions (MOVE accumulates forces; others execute immediately)
  const forces = createForceMap();
  for (const { characterId, action, context } of decisions) {
    const result = executeAction(currentWorld, characterId, action, context, forces);
    currentWorld = result.world;
    allEvents.push(...result.events);
  }

  // Step 4: Friction forces
  computeFrictionForces(currentWorld, forces);

  // Step 5: Collision detection and response
  computeCollisionForces(currentWorld, forces);

  // Step 6: Physics integration (velocity + position update)
  currentWorld = integratePhysics(currentWorld, forces);

  // Step 7+8: Basal metabolism and durability decay
  // Check starvation BEFORE applying metabolism, then apply both
  currentWorld = {
    ...currentWorld,
    characters: currentWorld.characters.map((c) => {
      const starving = !canPayMetabolism(c);
      const afterMetabolism = applyBasalMetabolism(c);
      return decayDurability(afterMetabolism, starving);
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

  return { world: currentWorld, events: allEvents };
}

// ============================================================
// Run simulation for N ticks
// ============================================================
export function runSimulation(
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
