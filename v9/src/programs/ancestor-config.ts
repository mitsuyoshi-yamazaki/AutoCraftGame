/**
 * 祖先種の標準実験config。
 * 最小祖先（Processor + Assembler + Storage + Harvester）をクレードル配置で1体置く。
 */

import type { InitialConfig } from '../sim/initial-state';
import { buildAncestorProgram } from './ancestor';
import type { AncestorOptions } from './ancestor';

export const ANCESTOR_INITIAL_ENERGY = 1000;

export const buildAncestorConfig = (
  seed: number,
  options: AncestorOptions = {},
  overrides: Partial<InitialConfig> = {},
): InitialConfig => ({
  seed,
  autoNodes: false,
  ancestors: [
    {
      x: 50,
      y: 50,
      cradle: true,
      components: [
        { type: 'Processor', program: buildAncestorProgram(options), running: true },
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
  ],
  ...overrides,
});
