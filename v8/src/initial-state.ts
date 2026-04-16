/**
 * Initial State Builder (v8) — creates the world with pre-connected {Assembler, Processor} pairs.
 */

import type { World, MaterialObject, EnergyObject, AssemblerObject, ProcessorObject } from './types.js';
import { createEmptyWorld, addObject, nextObjectId, createGroupWith } from './world.js';
import { createAssembler } from './assembler.js';
import { createProcessor } from './processor.js';
import { generateReplicatorProgram, generateReplicatorProgramV2 } from './programs.js';

export interface InitialStateConfig {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly numSets: number;
  readonly metalPerSet: number;
  readonly circuitPerSet: number;
  readonly energyPerSet: number;
  readonly programOptions?: { copySize?: number; targetRunning?: boolean };
  /** 'v1' = original buggy replicator; 'v2' = fixed replicator. */
  readonly programVariant?: 'v1' | 'v2';
  /** v2 only: whether the replicator loops after each cycle. */
  readonly programLoop?: boolean;
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
  const variant = config.programVariant ?? 'v1';
  const program = variant === 'v2'
    ? generateReplicatorProgramV2({
        copySize: progOpts.copySize,
        loop: config.programLoop ?? false,
      })
    : generateReplicatorProgram(progOpts);

  const margin = 5;
  const spacing = 2;

  for (let i = 0; i < config.numSets; i++) {
    const cx = margin + Math.random() * (config.worldWidth - 2 * margin);
    const cy = margin + Math.random() * (config.worldHeight - 2 * margin);

    // Create Assembler at the pair position
    let id: number;
    ({ id, world } = nextObjectId(world));
    const asmId = id;
    const asm = createAssembler(asmId, { x: cx, y: cy }, 0, 'idle');
    world = addObject(world, asm);

    // Create Processor pre-running with program
    ({ id, world } = nextObjectId(world));
    const procId = id;
    const proc = createProcessor(procId, { x: cx, y: cy }, program, true);
    world = addObject(world, proc);

    // Form the initial group {Assembler, Processor}
    ({ world } = createGroupWith(world, asmId, procId, { x: cx, y: cy }));

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
