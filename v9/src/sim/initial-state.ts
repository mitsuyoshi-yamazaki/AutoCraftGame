/**
 * 初期状態の生成。configとシードから決定論的にワールドを構築する。
 * 仕様: docs/specs/00_world_objects.md「初期状態」
 */

import { z } from 'zod';
import type { GameParams } from '../params';
import type { Rng } from '../rng';
import { substanceCodeOf } from './codes';
import { createComponent, withOpmem } from './components';
import { PROC_OFF_RUN_FLAG } from './opmem';
import { NATURAL_SOURCES } from '../craft/substances';
import type {
  ComponentObject,
  GroupObject,
  ProcessorComponent,
  StorageComponent,
  World,
} from './types';
import { COMPONENT_TYPES } from './types';
import { createEmptyWorld, getComponent, oppositeEdge, replaceObject } from './world';

// === config スキーマ（システム境界: zodで検証する） ===

const componentSpecSchema = z.object({
  type: z.enum(COMPONENT_TYPES as [string, ...string[]]),
  program: z.array(z.number().int().min(0).max(0xffff)).optional(),
  running: z.boolean().optional(),
  energy: z.number().int().min(0).optional(),
  items: z.record(z.string(), z.number().int().positive()).optional(),
});

const ancestorSchema = z.object({
  x: z.number(),
  y: z.number(),
  cradle: z.boolean().optional(),
  components: z.array(componentSpecSchema).min(1),
  /** [構成内indexA, 構成内indexB, Aの辺0-5] */
  connections: z
    .array(z.tuple([z.number().int().min(0), z.number().int().min(0), z.number().int().min(0).max(5)]))
    .optional(),
});

export const initialConfigSchema = z.object({
  seed: z.number().int(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  /** 自然資源ノードをパラメータに従いランダム配置するか（既定true） */
  autoNodes: z.boolean().optional(),
  ancestors: z.array(ancestorSchema).optional(),
});

export type InitialConfig = z.infer<typeof initialConfigSchema>;
export type AncestorSpec = z.infer<typeof ancestorSchema>;

// === 構築 ===

const CRADLE_RADIUS = 1.5;

const placeAutoNodes = (world: World, params: GameParams, rng: Rng): World => {
  let w = world;
  // MatterNode: 自然産出物質のデータ定義順 → 各ノード（乱数はx, yの順に消費）
  for (const substance of NATURAL_SOURCES) {
    const abundance = substance.naturalAbundance!;
    const count = params.nodeCountByAbundance[abundance] ?? 0;
    const amount = params.nodeAmountByAbundance[abundance] ?? 0;
    for (let i = 0; i < count; i++) {
      const x = 1 + rng() * (w.width - 2);
      const y = 1 + rng() * (w.height - 2);
      const id = w.nextObjectId;
      w = {
        ...w,
        nextObjectId: id + 1,
        objects: [
          ...w.objects,
          { id, kind: 'matterNode', position: { x, y }, substanceCode: substanceCodeOf(substance.id), remaining: amount },
        ],
      };
    }
  }
  // EnergyNode
  for (let i = 0; i < params.energyNodeCount; i++) {
    const x = 1 + rng() * (w.width - 2);
    const y = 1 + rng() * (w.height - 2);
    const id = w.nextObjectId;
    w = {
      ...w,
      nextObjectId: id + 1,
      objects: [...w.objects, { id, kind: 'energyNode', position: { x, y }, flowUsed: 0 }],
    };
  }
  return w;
};

/** クレードル: 祖先の周囲に全自然産出物質のノード＋EnergyNodeを決定論的に配置する */
const placeCradle = (world: World, x: number, y: number, params: GameParams): World => {
  let w = world;
  const points = NATURAL_SOURCES.length + 1;
  for (let i = 0; i < NATURAL_SOURCES.length; i++) {
    const substance = NATURAL_SOURCES[i];
    const angle = (i / points) * 2 * Math.PI;
    const id = w.nextObjectId;
    w = {
      ...w,
      nextObjectId: id + 1,
      objects: [
        ...w.objects,
        {
          id,
          kind: 'matterNode',
          position: { x: x + CRADLE_RADIUS * Math.cos(angle), y: y + CRADLE_RADIUS * Math.sin(angle) },
          substanceCode: substanceCodeOf(substance.id),
          remaining: params.nodeAmountByAbundance[substance.naturalAbundance!] ?? 0,
        },
      ],
    };
  }
  const angle = (NATURAL_SOURCES.length / points) * 2 * Math.PI;
  const id = w.nextObjectId;
  return {
    ...w,
    nextObjectId: id + 1,
    objects: [
      ...w.objects,
      {
        id,
        kind: 'energyNode',
        position: { x: x + CRADLE_RADIUS * Math.cos(angle), y: y + CRADLE_RADIUS * Math.sin(angle) },
        flowUsed: 0,
      },
    ],
  };
};

const placeAncestor = (world: World, spec: AncestorSpec, params: GameParams): World => {
  let w = world;
  const componentIds: number[] = [];

  for (const componentSpec of spec.components) {
    const id = w.nextObjectId;
    w = { ...w, nextObjectId: id + 1 };
    let component = createComponent(id, componentSpec.type as ComponentObject['componentType'], { x: spec.x, y: spec.y }, params);
    if (component.componentType === 'Processor') {
      const memory = [...component.memory];
      const program = componentSpec.program ?? [];
      for (let i = 0; i < program.length && i < memory.length; i++) memory[i] = program[i];
      const running = componentSpec.running ?? program.length > 0;
      // runningとopmemのrun_flagは常に同期させる（tick終了時にrun_flagから再計算されるため）
      component = withOpmem(
        { ...component, memory, running } as ProcessorComponent,
        PROC_OFF_RUN_FLAG,
        running ? 1 : 0,
      );
    }
    if (component.componentType === 'Storage') {
      const items = new Map<number, number>();
      for (const [substanceId, count] of Object.entries(componentSpec.items ?? {})) {
        items.set(substanceCodeOf(substanceId), count);
      }
      component = {
        ...component,
        energy: componentSpec.energy ?? 0,
        items,
      } as StorageComponent;
    }
    w = { ...w, objects: [...w.objects, component] };
    componentIds.push(id);
  }

  // 接続（configの辺指定。対面辺ルールで両側に設定）
  for (const [aIndex, bIndex, edge] of spec.connections ?? []) {
    const aId = componentIds[aIndex];
    const bId = componentIds[bIndex];
    const a = getComponent(w, aId);
    const b = getComponent(w, bId);
    if (a === undefined || b === undefined) {
      throw new Error(`接続指定が不正: [${aIndex}, ${bIndex}, ${edge}]`);
    }
    const bEdge = oppositeEdge(edge);
    if (a.edges[edge] !== null || b.edges[bEdge] !== null) {
      throw new Error(`辺が使用済み: [${aIndex}, ${bIndex}, ${edge}]`);
    }
    w = replaceObject(w, { ...a, edges: a.edges.map((p, i) => (i === edge ? bId : p)) });
    const b2 = getComponent(w, bId)!;
    w = replaceObject(w, { ...b2, edges: b2.edges.map((p, i) => (i === bEdge ? aId : p)) });
  }

  // 接続された成分をグループ化する
  w = groupConnectedComponents(w, componentIds, { x: spec.x, y: spec.y });

  if (spec.cradle === true) {
    w = placeCradle(w, spec.x, spec.y, params);
  }
  return w;
};

const groupConnectedComponents = (
  world: World,
  componentIds: readonly number[],
  position: { x: number; y: number },
): World => {
  let w = world;
  const seen = new Set<number>();
  for (const startId of componentIds) {
    if (seen.has(startId)) continue;
    const cluster: number[] = [];
    const stack = [startId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      cluster.push(current);
      const component = getComponent(w, current);
      if (component === undefined) continue;
      for (const peer of component.edges) {
        if (peer !== null && !seen.has(peer)) stack.push(peer);
      }
    }
    if (cluster.length < 2) continue;
    const groupId = w.nextObjectId;
    const group: GroupObject = {
      id: groupId,
      kind: 'group',
      position,
      velocity: { x: 0, y: 0 },
      memberIds: cluster.sort((a, b) => a - b),
    };
    w = { ...w, nextObjectId: groupId + 1, objects: [...w.objects, group] };
    for (const memberId of cluster) {
      const component = getComponent(w, memberId)!;
      w = replaceObject(w, {
        ...component,
        groupId,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
      });
    }
  }
  return w;
};

/** configからワールドを構築する。rngはシミュレーション本体と同一のものを渡すこと */
export const buildInitialWorld = (
  config: InitialConfig,
  params: GameParams,
  rng: Rng,
): World => {
  let world = createEmptyWorld(config.width ?? params.worldWidth, config.height ?? params.worldHeight);
  if (config.autoNodes !== false) {
    world = placeAutoNodes(world, params, rng);
  }
  for (const ancestor of config.ancestors ?? []) {
    world = placeAncestor(world, ancestor, params);
  }
  return world;
};
