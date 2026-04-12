/**
 * Initial State Builder — creates the v7 world with a-d component sets.
 */

import type { World, MaterialObject, EnergyObject } from './types.js';
import { createEmptyWorld, addObject, nextObjectId } from './world.js';
import { createAssembler } from './assembler.js';
import { createProcessor } from './processor.js';
import { generateReplicatorProgram } from './programs.js';

export interface InitialStateConfig {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly numSets: number;
  readonly metalPerSet: number;
  readonly circuitPerSet: number;
  readonly energyPerSet: number;
  readonly programOptions?: { copySize?: number; targetRunning?: boolean };
}

export const DEFAULT_INITIAL_CONFIG: InitialStateConfig = {
  worldWidth: 100,
  worldHeight: 100,
  numSets: 20,
  metalPerSet: 10,
  circuitPerSet: 15,
  energyPerSet: 200,
};

export function createInitialState(config: InitialStateConfig = DEFAULT_INITIAL_CONFIG): World {
  let world = createEmptyWorld(config.worldWidth, config.worldHeight);

  const progOpts = config.programOptions ?? {};
  const programC = generateReplicatorProgram(3, progOpts);  // Assembler recipe
  const programD = generateReplicatorProgram(4, progOpts);  // Processor recipe

  const margin = 5;
  const spacing = 2;  // spacing between objects within a set

  for (let i = 0; i < config.numSets; i++) {
    // Random position for this set's center
    const cx = margin + Math.random() * (config.worldWidth - 2 * margin);
    const cy = margin + Math.random() * (config.worldHeight - 2 * margin);

    // a: Assembler(recipe=3, gathering)
    let id: string;
    ({ id, world } = nextObjectId(world));
    world = addObject(world, createAssembler(id, { x: cx - spacing, y: cy - spacing }, 3, 'gathering'));

    // b: Assembler(recipe=4, gathering)
    ({ id, world } = nextObjectId(world));
    world = addObject(world, createAssembler(id, { x: cx + spacing, y: cy - spacing }, 4, 'gathering'));

    // c: Processor(programC, running)
    ({ id, world } = nextObjectId(world));
    world = addObject(world, createProcessor(id, { x: cx - spacing, y: cy + spacing }, programC, true));

    // d: Processor(programD, running)
    ({ id, world } = nextObjectId(world));
    world = addObject(world, createProcessor(id, { x: cx + spacing, y: cy + spacing }, programD, true));

    // Materials: Metal
    for (let j = 0; j < config.metalPerSet; j++) {
      ({ id, world } = nextObjectId(world));
      const mx = cx + (Math.random() - 0.5) * spacing * 2;
      const my = cy + (Math.random() - 0.5) * spacing * 2;
      const mat: MaterialObject = {
        id, kind: 'material', position: { x: mx, y: my }, orientation: 0,
        materialType: 'Metal', amount: 1,
      };
      world = addObject(world, mat);
    }

    // Materials: Circuit
    for (let j = 0; j < config.circuitPerSet; j++) {
      ({ id, world } = nextObjectId(world));
      const mx = cx + (Math.random() - 0.5) * spacing * 2;
      const my = cy + (Math.random() - 0.5) * spacing * 2;
      const mat: MaterialObject = {
        id, kind: 'material', position: { x: mx, y: my }, orientation: 0,
        materialType: 'Circuit', amount: 1,
      };
      world = addObject(world, mat);
    }

    // Energy
    ({ id, world } = nextObjectId(world));
    const eng: EnergyObject = {
      id, kind: 'energy', position: { x: cx, y: cy }, orientation: 0,
      amount: config.energyPerSet,
    };
    world = addObject(world, eng);
  }

  return world;
}
