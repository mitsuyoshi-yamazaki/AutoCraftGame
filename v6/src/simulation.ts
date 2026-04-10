/**
 * Simulation Loop — orchestrates a single tick of the game world.
 *
 * Tick order:
 * 1.  EnergyNode production
 * 2.  VM execution for all active characters -> action reservations
 * 3.  Execute all reserved actions (character ID ascending)
 * 4.  Friction forces
 * 5.  Collision detection
 * 6.  Physics integration
 * 7.  Basal metabolism (with aging)
 * 8.  Durability decay
 * 9.  Death check -> remains
 * 10. Remains absorption
 * 11. Node regeneration
 * 12. tick++
 */

import type {
  World,
  TickResult,
  SimulationEvent,
  ActionRecord,
} from './types.js';
import type { GameParams } from './params.js';
import type { CharacterEngine } from './character.js';
import { isActive, isDead, setVmState, updateApoptosisCounters, shouldApoptose } from './character.js';
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
import { absorbOldRemains, regenerateNodes } from './ground.js';
import { executeOneTick } from './vm/vm.js';
import { createIoHandler, buildWorldLookup } from './io.js';
import type { IoResult, ActionReservation } from './io.js';
import type { ReflexEngine } from './reflexes.js';
import type { PrimitiveEngine } from './primitives.js';

// ============================================================
// SimulationEngine
// ============================================================
export interface SimulationEngine {
  executeTick(world: World): TickResult;
  runSimulation(
    initialWorld: World,
    ticks: number,
    onTick?: (result: TickResult) => void,
  ): { world: World; allEvents: SimulationEvent[] };
}

export interface SimulationEngineDeps {
  characterEngine: CharacterEngine;
  actionEngine: ActionEngine;
  physicsEngine: PhysicsEngine;
  reflexEngine: ReflexEngine;
  primitiveEngine: PrimitiveEngine;
}

export function createSimulationEngine(
  params: GameParams,
  deps: SimulationEngineDeps,
): SimulationEngine {
  const { characterEngine, actionEngine, physicsEngine, reflexEngine, primitiveEngine } = deps;

  function executeTick(world: World): TickResult {
    let currentWorld = world;
    const allEvents: SimulationEvent[] = [];
    const allActions: Map<string, readonly ActionRecord[]> = new Map();

    // Step 1: EnergyNode production
    currentWorld = produceEnergy(currentWorld);

    // Build spatial grid and lookup maps (used in steps 2-5)
    const grid = buildGrid(currentWorld, params.senseRange);
    const lookup = buildWorldLookup(currentWorld);

    // Step 2: VM execution for all active characters
    const instructionLimitHits: Set<string> = new Set();
    const checkpointHits: Set<string> = new Set();
    const reflexHits: Set<string> = new Set();

    // Collect I/O results (reservations + updated local IDs)
    const characterIoResults: {
      characterId: string;
      reservations: readonly ActionReservation[];
      localIdTable: ReadonlyMap<number, string>;
      localIdCounter: number;
    }[] = [];

    for (const character of currentWorld.characters) {
      const hasPrimitives = character.primitiveRules.length > 0;

      if (isActive(character)) {
        // --- VM-based control (existing) ---
        const ioHandler = createIoHandler(character, currentWorld, params, grid, lookup);
        const execResult = executeOneTick(
          character.vm,
          ioHandler.ioRead,
          ioHandler.ioWrite,
          params.instructionsPerTick,
        );

        if (execResult.hitLimit) instructionLimitHits.add(character.id);
        if (execResult.checkpointHit) checkpointHits.add(character.id);

        const ioResult = ioHandler.getResult();
        const updatedCharacter = setVmState(character, {
          ...execResult.vm,
          localIdTable: ioResult.updatedVmLocalIdTable,
          localIdCounter: ioResult.updatedVmLocalIdCounter,
        });
        currentWorld = updateCharacter(currentWorld, updatedCharacter);

        // Step 2.5: Reflex injection (M2)
        const reflexResult = reflexEngine.injectReflexes(
          updatedCharacter, currentWorld, ioResult.reservations, grid,
        );
        if (reflexResult.fired) reflexHits.add(character.id);

        characterIoResults.push({
          characterId: character.id,
          reservations: reflexResult.reservations,
          localIdTable: ioResult.updatedVmLocalIdTable,
          localIdCounter: ioResult.updatedVmLocalIdCounter,
        });

      } else if (hasPrimitives) {
        // --- Primitive-based control (v6) ---
        const primitiveReservations = primitiveEngine.evaluate(character, currentWorld, grid);

        // Reflex injection applies to primitive characters too
        const reflexResult = reflexEngine.injectReflexes(
          character, currentWorld, primitiveReservations, grid,
        );
        if (reflexResult.fired) reflexHits.add(character.id);

        characterIoResults.push({
          characterId: character.id,
          reservations: reflexResult.reservations,
          localIdTable: character.vm.localIdTable,
          localIdCounter: character.vm.localIdCounter,
        });
      }
      // else: no Processor and no primitives — character does nothing (reflex-only via M2)
    }

    // Step 3: Execute all reserved actions (character ID ascending order)
    // Sort by character ID
    characterIoResults.sort((a, b) => a.characterId.localeCompare(b.characterId));

    const forces = createForceMap();

    for (const { characterId, reservations, localIdTable } of characterIoResults) {
      if (reservations.length === 0) continue;

      const result = actionEngine.executeReservations(
        currentWorld, characterId, reservations, localIdTable, forces, grid,
      );
      currentWorld = result.world;
      allEvents.push(...result.events);
      allActions.set(characterId, result.records);

      // Update local ID table on character's VM state
      const updatedChar = currentWorld.characters.find(c => c.id === characterId);
      if (updatedChar) {
        const updatedVm = {
          ...updatedChar.vm,
          localIdTable: result.updatedLocalIdTable,
        };
        currentWorld = updateCharacter(currentWorld, { ...updatedChar, vm: updatedVm });
      }
    }

    // Step 4: Friction forces
    physicsEngine.computeFrictionForces(currentWorld, forces);

    // Step 5: Collision detection and response
    const collisionGrid = buildGrid(currentWorld, params.senseRange);
    physicsEngine.computeCollisionForces(currentWorld, forces, collisionGrid);

    // Step 6: Physics integration
    currentWorld = physicsEngine.integratePhysics(currentWorld, forces);

    // Step 7+8: Basal metabolism and durability decay
    currentWorld = {
      ...currentWorld,
      characters: currentWorld.characters.map((c) => {
        const starving = !characterEngine.canPayMetabolism(c, currentWorld.tick);
        const afterMetabolism = characterEngine.applyBasalMetabolism(c, currentWorld.tick);
        return characterEngine.decayDurability(afterMetabolism, starving);
      }),
    };

    // Step 8.5: Apoptosis counter update + judgment (M3)
    // Each character's idle/instr_limit counters are updated based on this
    // tick's outcomes. If either counter reaches its threshold, durability
    // is set to 0 so the character dies in step 9.
    const apoptosisDeaths: Set<string> = new Set();
    currentWorld = {
      ...currentWorld,
      characters: currentWorld.characters.map((c) => {
        const records = allActions.get(c.id) ?? [];
        const hadAction = records.length > 0;
        const hitInstrLimit = instructionLimitHits.has(c.id);
        const updated = updateApoptosisCounters(c, hadAction, hitInstrLimit);
        if (
          shouldApoptose(
            updated,
            params.apoptosisIdleTickLimit,
            params.apoptosisInstrLimitTickLimit,
          )
        ) {
          apoptosisDeaths.add(updated.id);
          return { ...updated, durability: 0 };
        }
        return updated;
      }),
    };

    // Step 9: Death check -> remains
    const deadIds: string[] = [];
    for (const character of currentWorld.characters) {
      if (isDead(character)) {
        deadIds.push(character.id);
        allEvents.push({ type: 'character_died', id: character.id });
        const { id: remainsId, world: w } = nextObjectId(currentWorld);
        currentWorld = w;
        const remains = createRemains(
          remainsId, character.position, character.components,
          character.inventory, currentWorld.tick,
        );
        currentWorld = addRemains(currentWorld, remains);
      }
    }
    for (const id of deadIds) {
      currentWorld = removeCharacter(currentWorld, id);
    }

    // Step 10: Remains absorption
    currentWorld = absorbOldRemains(currentWorld, params);

    // Step 11: Node regeneration
    currentWorld = regenerateNodes(currentWorld, params);

    // Step 12: tick++
    currentWorld = { ...currentWorld, tick: currentWorld.tick + 1 };

    return { world: currentWorld, events: allEvents, actions: allActions, instructionLimitHits, checkpointHits, reflexHits, apoptosisDeaths };
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
