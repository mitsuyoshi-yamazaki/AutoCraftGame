import { DEFAULT_GAME_PARAMS } from '../src/params';
import type { GameParams } from '../src/params';
import { substanceCodeOf } from '../src/sim/codes';
import { buildInitialWorld } from '../src/sim/initial-state';
import type { InitialConfig } from '../src/sim/initial-state';
import type { ComponentObject, ComponentType, World, WorldObject } from '../src/sim/types';
import { createRng } from '../src/rng';

export const makeParams = (overrides: Partial<GameParams> = {}): GameParams => ({
  ...DEFAULT_GAME_PARAMS,
  ...overrides,
});

export const buildWorld = (config: InitialConfig, params: GameParams = DEFAULT_GAME_PARAMS): World =>
  buildInitialWorld(config, params, createRng(config.seed));

export const findComponents = (world: World, componentType: ComponentType): ComponentObject[] =>
  world.objects.filter(
    (o): o is ComponentObject => o.kind === 'component' && o.componentType === componentType,
  );

export const findComponent = (world: World, componentType: ComponentType): ComponentObject => {
  const found = findComponents(world, componentType);
  if (found.length === 0) throw new Error(`${componentType} が存在しない`);
  return found[0];
};

export const addMatterNode = (
  world: World,
  x: number,
  y: number,
  substanceId: string,
  remaining: number,
): World => {
  const id = world.nextObjectId;
  return {
    ...world,
    nextObjectId: id + 1,
    objects: [
      ...world.objects,
      { id, kind: 'matterNode', position: { x, y }, substanceCode: substanceCodeOf(substanceId), remaining },
    ],
  };
};

export const addEnergyNode = (world: World, x: number, y: number): World => {
  const id = world.nextObjectId;
  return {
    ...world,
    nextObjectId: id + 1,
    objects: [...world.objects, { id, kind: 'energyNode', position: { x, y }, flowUsed: 0 }],
  };
};

/** Map等を正規化した決定論比較用スナップショット */
export const snapshot = (world: World): string =>
  JSON.stringify(world, (key, value: unknown) => {
    if (value instanceof Map) {
      return [...(value as Map<unknown, unknown>).entries()].sort((a, b) =>
        String(a[0]).localeCompare(String(b[0])),
      );
    }
    return value;
  });

/** 標準の4コンポーネント祖先（Processor-Assembler-Storage-Harvesterのチェーン接続） */
export const minimalAncestorConfig = (
  program: number[],
  energy: number,
  overrides: Partial<InitialConfig> = {},
): InitialConfig => ({
  seed: 42,
  autoNodes: false,
  ancestors: [
    {
      x: 50,
      y: 50,
      cradle: true,
      components: [
        { type: 'Processor', program, running: program.length > 0 },
        { type: 'Assembler' },
        { type: 'Storage', energy },
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

export type { WorldObject };
