import type { Action, Character, SimulationEvent, TickResult, World } from './types.js';
import { decayDurability, isDead, isActive } from './character.js';
import { evaluateProgram, executeAction } from './program.js';
import { regenerateResources, removeCharacter, updateCharacter } from './world.js';

// ============================================================
// Single tick execution
// ============================================================
export function executeTick(world: World): TickResult {
  let currentWorld = world;
  const allEvents: SimulationEvent[] = [];

  // Step 1: Determine actions for all active characters
  const decisions: { characterId: string; action: Action; context: any }[] = [];
  for (const character of currentWorld.characters) {
    if (!isActive(character) || !character.program) continue;
    const { action, context } = evaluateProgram(character.program, character, currentWorld);
    decisions.push({ characterId: character.id, action, context });
  }

  // Step 2: Execute all actions
  for (const { characterId, action, context } of decisions) {
    const result = executeAction(currentWorld, characterId, action, context);
    currentWorld = result.world;
    allEvents.push(...result.events);
  }

  // Step 3: Durability decay for all characters
  currentWorld = {
    ...currentWorld,
    characters: currentWorld.characters.map(decayDurability),
  };

  // Step 4: Death check — remove dead characters
  const deadIds: string[] = [];
  for (const character of currentWorld.characters) {
    if (isDead(character)) {
      deadIds.push(character.id);
      allEvents.push({ type: 'character_died', id: character.id });
    }
  }
  for (const id of deadIds) {
    currentWorld = removeCharacter(currentWorld, id);
  }

  // Step 5: Resource regeneration
  currentWorld = regenerateResources(currentWorld);

  // Step 6: Increment tick
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

    // Stop early if no characters remain
    if (world.characters.length === 0) break;
  }

  return { world, allEvents };
}
