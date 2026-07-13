/**
 * 捕食実験config: 増殖する祖先コロニー＋休眠から目覚める捕食者。
 */

import type { InitialConfig } from '../sim/initial-state';
import { buildAncestorProgram } from './ancestor';
import { buildPredatorProgram } from './predator';
import { ANCESTOR_INITIAL_ENERGY } from './ancestor-config';

export const PREDATOR_WAKE_TICK = 1500;

export const buildPredationConfig = (seed: number): InitialConfig => ({
  seed,
  autoNodes: false,
  ancestors: [
    {
      x: 50,
      y: 50,
      cradle: true,
      components: [
        { type: 'Processor', program: buildAncestorProgram(), running: true },
        { type: 'Assembler' },
        { type: 'Storage', energy: ANCESTOR_INITIAL_ENERGY },
        { type: 'Harvester' },
      ],
      connections: [
        [0, 1, 0],
        [1, 2, 1],
        [2, 3, 2],
      ],
    },
    {
      // SCAN射程（10）内にコロニーが入る距離に置く
      x: 58,
      y: 50,
      components: [
        { type: 'Processor', program: buildPredatorProgram(PREDATOR_WAKE_TICK), running: true },
        { type: 'Storage', energy: 3000 },
        { type: 'Disassembler' },
        { type: 'Sensor' },
        { type: 'Actuator' },
      ],
      connections: [
        [0, 1, 0],
        [1, 2, 1],
        [2, 3, 2],
        [3, 4, 0],
      ],
    },
  ],
});
