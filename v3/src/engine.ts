import type { World, TickResult, SimulationEvent, Character, Program, Position, ComponentType } from './types.js';
import type { GameParams } from './params.js';
import { createRecipeEngine } from './recipes.js';
import type { RecipeEngine } from './recipes.js';
import { createCharacterEngine } from './character.js';
import type { CharacterEngine } from './character.js';
import { createWorldEngine, createWorld } from './world.js';
import type { WorldEngine, WorldConfig } from './world.js';
import type { Rng } from './world.js';
import { createPhysicsEngine } from './physics.js';
import { createProgramEngine } from './program.js';
import { createActionEngine } from './actions.js';
import { createSimulationEngine } from './simulation.js';
import type { SimulationEngine } from './simulation.js';

// ============================================================
// Engine — top-level API that bundles all param-bound functions
// ============================================================
export interface Engine {
  readonly params: GameParams;
  readonly recipeEngine: RecipeEngine;
  readonly characterEngine: CharacterEngine;
  readonly worldEngine: WorldEngine;
  readonly simulation: SimulationEngine;
  executeTick(world: World): TickResult;
  runSimulation(initialWorld: World, ticks: number, onTick?: (result: TickResult) => void): { world: World; allEvents: SimulationEvent[] };
  createCharacter(
    id: string, position: Position, components: readonly ComponentType[],
    program: Program, energy: number, species: string,
  ): Character;
  createInactiveCharacter(
    id: string, position: Position, components: readonly ComponentType[],
    energy: number, species: string,
  ): Character;
  createWorld(config: WorldConfig, rng: Rng): World;
}

export function createEngine(params: GameParams): Engine {
  const recipeEngine = createRecipeEngine(params);
  const worldEngine = createWorldEngine(params);
  const characterEngine = createCharacterEngine(params);
  const physicsEngine = createPhysicsEngine(params, recipeEngine, worldEngine);
  const programEngine = createProgramEngine(params);
  const actionEngine = createActionEngine(params, { recipeEngine, worldEngine, characterEngine, programEngine });
  const simulation = createSimulationEngine(params, { characterEngine, programEngine, actionEngine, physicsEngine });

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
  };
}
