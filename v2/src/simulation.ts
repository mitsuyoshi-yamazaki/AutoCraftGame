import type { Action, Character, SimulationEvent, TickResult, World } from './types.js';
import { applyBasalMetabolism, decayDurability, isDead, isActive } from './character.js';
import { evaluateProgram } from './program.js';
import { executeAction } from './actions.js';
import {
  produceEnergy,
  removeCharacter,
  removeDepletedNodes,
  updateCharacter,
  addRemains,
  createRemains,
} from './world.js';

// ============================================================
// Single tick execution (v2: 8-step game loop)
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

  // Step 3: Execute all actions (with energy checks)
  for (const { characterId, action, context } of decisions) {
    const result = executeAction(currentWorld, characterId, action, context);
    currentWorld = result.world;
    allEvents.push(...result.events);
  }

  // Step 4: Basal metabolism for all characters
  currentWorld = {
    ...currentWorld,
    characters: currentWorld.characters.map(applyBasalMetabolism),
  };

  // Step 5: Durability decay for all characters
  currentWorld = {
    ...currentWorld,
    characters: currentWorld.characters.map(decayDurability),
  };

  // Step 6: Death check — create remains and remove dead characters
  const deadIds: string[] = [];
  for (const character of currentWorld.characters) {
    if (isDead(character)) {
      deadIds.push(character.id);
      allEvents.push({ type: 'character_died', id: character.id });
      // Create remains (energy is NOT preserved — dissipates)
      const remains = createRemains(character.position, character.components, character.inventory);
      currentWorld = addRemains(currentWorld, remains);
    }
  }
  for (const id of deadIds) {
    currentWorld = removeCharacter(currentWorld, id);
  }

  // Step 7: Remove depleted ResourceNodes
  currentWorld = removeDepletedNodes(currentWorld);

  // Step 8: Increment tick
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
