/**
 * 生態系実験config: 複数の祖先種を競争させ、空間の広さや変異率を変えて動態を観察する。
 * ユーザー提案の「祖先種の追加」「空間の拡大」「パラメータ変更」を試す。
 */

import type { InitialConfig } from '../sim/initial-state';
import { buildAncestorProgram } from './ancestor';
import { ANCESTOR_INITIAL_ENERGY } from './ancestor-config';
import { buildPredatorProgram } from './predator';

interface EcologyOptions {
  /** 祖先コロニーの数（各自クレードル付き） */
  readonly colonies?: number;
  /** ワールドの一辺（広いほど競争が緩む） */
  readonly worldSize?: number;
  /** コロニー間の距離。小さいとクレードル（資源）が重なり競争が起きる */
  readonly spacing?: number;
  /** 変異を有効にする */
  readonly mutation?: boolean;
  /** 捕食者を1体入れる */
  readonly predator?: boolean;
}

const ancestorGroup = (x: number, y: number, mutation: boolean, salt: number) => ({
  x,
  y,
  cradle: true,
  components: [
    {
      type: 'Processor' as const,
      program: buildAncestorProgram({ mutation, mutationGateMask: mutation ? 3 : 0, seedSalt: salt }),
      running: true,
    },
    { type: 'Assembler' as const },
    { type: 'Storage' as const, energy: ANCESTOR_INITIAL_ENERGY },
    { type: 'Harvester' as const },
  ],
  connections: [
    [0, 1, 0] as [number, number, number],
    [1, 2, 1] as [number, number, number],
    [2, 3, 2] as [number, number, number],
  ],
});

export const buildEcologyConfig = (seed: number, options: EcologyOptions = {}): InitialConfig => {
  const colonies = options.colonies ?? 2;
  const worldSize = options.worldSize ?? 100;
  const mutation = options.mutation ?? false;

  // コロニーをワールド中央付近に一列に配置する。
  // spacingが小さい（<約9）とクレードルの資源ノードが重なり、コロニー間で競争が生じる
  const spacing = options.spacing ?? Math.max(12, worldSize / (colonies + 1));
  const ancestors = [];
  for (let i = 0; i < colonies; i++) {
    const x = worldSize / 2 + (i - (colonies - 1) / 2) * spacing;
    ancestors.push(ancestorGroup(x, worldSize / 2, mutation, i + 1));
  }
  if (options.predator === true) {
    ancestors.push({
      x: worldSize / 2,
      y: worldSize / 2 - 8,
      components: [
        { type: 'Processor' as const, program: buildPredatorProgram(2000), running: true },
        { type: 'Storage' as const, energy: 3000 },
        { type: 'Disassembler' as const },
        { type: 'Sensor' as const },
        { type: 'Actuator' as const },
      ],
      connections: [
        [0, 1, 0] as [number, number, number],
        [1, 2, 1] as [number, number, number],
        [2, 3, 2] as [number, number, number],
        [3, 4, 0] as [number, number, number],
      ],
    });
  }
  return { seed, width: worldSize, height: worldSize, autoNodes: false, ancestors };
};
