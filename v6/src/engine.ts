/**
 * Engine Factory — wires all game subsystems together.
 *
 * Provides a single entry point for creating a fully configured game engine.
 */

import type {
  World,
  TickResult,
  SimulationEvent,
  Character,
  Position,
  ComponentType,
  ProgramDefinition,
} from './types.js';
import type { GameParams } from './params.js';
import { createRecipeEngine } from './recipes.js';
import type { RecipeEngine } from './recipes.js';
import { createCharacterEngine } from './character.js';
import type { CharacterEngine } from './character.js';
import { createWorldEngine, createWorld, nextCharacterId, updateCharacter, addCharacter } from './world.js';
import type { WorldEngine, WorldConfig } from './world.js';
import type { Rng } from './world.js';
import { createPhysicsEngine } from './physics.js';
import { createActionEngine } from './actions.js';
import type { ActionEngine } from './actions.js';
import { createSimulationEngine } from './simulation.js';
import type { SimulationEngine } from './simulation.js';
import { createReflexEngine } from './reflexes.js';
import { createPrimitiveEngine } from './primitives.js';
import type { PrimitiveDefinition } from './types.js';

// ============================================================
// Engine — top-level API
// ============================================================
export interface Engine {
  readonly params: GameParams;
  readonly recipeEngine: RecipeEngine;
  readonly characterEngine: CharacterEngine;
  readonly worldEngine: WorldEngine;
  readonly simulation: SimulationEngine;
  executeTick(world: World): TickResult;
  runSimulation(
    initialWorld: World,
    ticks: number,
    onTick?: (result: TickResult) => void,
  ): { world: World; allEvents: SimulationEvent[] };
  createCharacter(
    id: string,
    position: Position,
    components: readonly ComponentType[],
    program: readonly number[],
    energy: number,
    species: string,
    createdAt: number,
  ): Character;
  createInactiveCharacter(
    id: string,
    position: Position,
    components: readonly ComponentType[],
    energy: number,
    species: string,
    createdAt: number,
  ): Character;
  createWorld(config: WorldConfig, rng: Rng): World;
  spawnInitialCharacters(
    world: World,
    definitions: readonly ProgramDefinition[],
    rng: Rng,
  ): World;
  spawnPrimitiveCharacters(
    world: World,
    definitions: readonly PrimitiveDefinition[],
    rng: Rng,
  ): World;
}

export function createEngine(params: GameParams): Engine {
  const recipeEngine = createRecipeEngine(params);
  const worldEngine = createWorldEngine(params);
  const characterEngine = createCharacterEngine(params);
  const physicsEngine = createPhysicsEngine(params, recipeEngine, worldEngine);
  const actionEngine = createActionEngine(params, {
    recipeEngine,
    worldEngine,
    characterEngine,
  });
  const reflexEngine = createReflexEngine(params);
  const primitiveEngine = createPrimitiveEngine(params);
  const simulation = createSimulationEngine(params, {
    characterEngine,
    actionEngine,
    physicsEngine,
    reflexEngine,
    primitiveEngine,
  });

  function spawnInitialCharacters(
    world: World,
    definitions: readonly ProgramDefinition[],
    rng: Rng,
  ): World {
    let w = world;
    for (const def of definitions) {
      const count = def.count ?? 1;
      for (let i = 0; i < count; i++) {
        const { id, world: w2 } = nextCharacterId(w);
        w = w2;
        const margin = 1.0;
        const pos: Position = {
          x: margin + rng() * (world.width - 2 * margin),
          y: margin + rng() * (world.height - 2 * margin),
        };
        const character = characterEngine.createCharacter(
          id, pos, def.components, def.program,
          params.assembleEnergyTransfer, def.name, 0,
        );
        w = addCharacter(w, character);
      }
    }
    return w;
  }

  function spawnPrimitiveCharacters(
    world: World,
    definitions: readonly PrimitiveDefinition[],
    rng: Rng,
  ): World {
    let w = world;
    for (const def of definitions) {
      const count = def.count ?? 1;
      for (let i = 0; i < count; i++) {
        const { id, world: w2 } = nextCharacterId(w);
        w = w2;
        const margin = 1.0;
        const pos: Position = {
          x: margin + rng() * (world.width - 2 * margin),
          y: margin + rng() * (world.height - 2 * margin),
        };
        const character = characterEngine.createPrimitiveCharacter(
          id, pos, def.components, def.rules, def.templates,
          params.assembleEnergyTransfer, def.name, 0,
        );
        w = addCharacter(w, character);
      }
    }
    return w;
  }

  return {
    params,
    recipeEngine,
    characterEngine,
    worldEngine,
    simulation,
    executeTick: simulation.executeTick,
    runSimulation: simulation.runSimulation,
    createCharacter: characterEngine.createCharacter,
    createInactiveCharacter: characterEngine.createInactiveCharacter,
    createWorld: (config: WorldConfig, rng: Rng) => createWorld(config, rng, worldEngine),
    spawnInitialCharacters,
    spawnPrimitiveCharacters,
  };
}
