/**
 * 空間競争config: 移動種と定住種を同じ散在資源の世界に置いて競争させる。
 *
 * 移動種は世界中を探索採取して広がり、定住種はクレードルの局所資源に依存する。
 * 資源は有限（autoNodes）で、両種が同じ資源プールを奪い合う。
 * 種別はコンポーネント構成で判別できる（移動種はActuatorを持ち、定住種は持たない）。
 */

import type { InitialConfig } from '../sim/initial-state';
import { buildAncestorProgram } from './ancestor';
import { ANCESTOR_INITIAL_ENERGY } from './ancestor-config';
import { buildMobileProgram } from './mobile';
import type { MobileOptions } from './mobile';

export const buildCompetitionConfig = (
  seed: number,
  options: MobileOptions = {},
): InitialConfig => ({
  seed,
  autoNodes: true,
  ancestors: [
    {
      // 移動種（6部品。世界中を移動して資源を探索採取する）
      x: 30,
      y: 50,
      cradle: false,
      components: [
        { type: 'Processor', program: buildMobileProgram(options), running: true },
        { type: 'Assembler' },
        { type: 'Storage', energy: 1500 },
        { type: 'Harvester' },
        { type: 'Sensor' },
        { type: 'Actuator' },
      ],
      connections: [
        [0, 1, 0],
        [1, 2, 1],
        [2, 3, 0],
        [2, 4, 1],
        [2, 5, 2],
      ],
    },
    {
      // 定住種（4部品＋クレードル。局所資源に依存し移動しない）
      x: 70,
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
  ],
});
