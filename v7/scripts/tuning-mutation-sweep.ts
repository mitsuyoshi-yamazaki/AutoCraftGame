/**
 * Sweep instructionsPerTick to find the threshold for successful Processor startup.
 * Smaller world (30x30) to increase density.
 */

import { DEFAULT_GAME_PARAMS, type GameParams } from '../src/params.js';
import { createInitialState, type InitialStateConfig } from '../src/initial-state.js';
import { runSimulation } from '../src/simulation.js';
import type { ProcessorObject } from '../src/types.js';

const TICKS = 300;
const INSTRUCTIONS_VALUES = [4000, 4500, 5000, 6000, 7000, 8000, 10000];

const config: InitialStateConfig = {
  worldWidth: 30,
  worldHeight: 30,
  numSets: 20,
  metalPerSet: 10,
  circuitPerSet: 15,
  energyPerSet: 200,
};

console.log('=== instructionsPerTick Sweep (300 ticks, 30x30) ===');
console.log();

for (const ipt of INSTRUCTIONS_VALUES) {
  const params: GameParams = { ...DEFAULT_GAME_PARAMS, instructionsPerTick: ipt };
  const world = createInitialState(config);
  const { world: finalWorld, allEvents } = runSimulation(world, params, TICKS);

  const processors = finalWorld.objects.filter(o => o.kind === 'processor') as ProcessorObject[];
  const running = processors.filter(p => p.running).length;
  const produced = allEvents.filter(e => e.type === 'assembler_completed').length;

  console.log(
    `ipt=${String(ipt).padStart(5)} | ` +
    `proc:${processors.length} running:${running} ` +
    `produced:${produced}`
  );
}
