/**
 * ワールド操作 — オブジェクトCRUD、実効位置、到達可能性、接続グラフ操作。
 * 仕様: docs/specs/00_world_objects.md, 01_physics.md
 */

import type {
  ComponentObject,
  GroupObject,
  Position,
  World,
  WorldObject,
} from './types';
import { EDGE_COUNT, emptyEdges } from './types';

export const distance = (a: Position, b: Position): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const oppositeEdge = (edge: number): number => (edge + 3) % EDGE_COUNT;

// === Object CRUD ===

export const nextObjectId = (world: World): { id: number; world: World } => ({
  id: world.nextObjectId,
  world: { ...world, nextObjectId: world.nextObjectId + 1 },
});

export const addObject = (world: World, obj: WorldObject): World => ({
  ...world,
  objects: [...world.objects, obj],
});

export const removeObject = (world: World, id: number): World => ({
  ...world,
  objects: world.objects.filter(o => o.id !== id),
});

export const replaceObject = (world: World, obj: WorldObject): World => ({
  ...world,
  objects: world.objects.map(o => (o.id === obj.id ? obj : o)),
});

export const getObject = (world: World, id: number): WorldObject | undefined =>
  world.objects.find(o => o.id === id);

export const getComponent = (world: World, id: number): ComponentObject | undefined => {
  const obj = getObject(world, id);
  return obj !== undefined && obj.kind === 'component' ? obj : undefined;
};

export const getGroup = (world: World, id: number): GroupObject | undefined => {
  const obj = getObject(world, id);
  return obj !== undefined && obj.kind === 'group' ? obj : undefined;
};

export const allComponents = (world: World): ComponentObject[] =>
  world.objects.filter((o): o is ComponentObject => o.kind === 'component');

// === 実効位置 ===

export const effectivePosition = (world: World, obj: WorldObject): Position => {
  if (obj.kind === 'component' && obj.groupId !== null) {
    const group = getGroup(world, obj.groupId);
    if (group !== undefined) return group.position;
  }
  return obj.position;
};

// === グループ・到達可能性 ===

export const getMemberGroup = (world: World, componentId: number): GroupObject | undefined => {
  const component = getComponent(world, componentId);
  if (component === undefined || component.groupId === null) return undefined;
  return getGroup(world, component.groupId);
};

export const inSameGroup = (world: World, aId: number, bId: number): boolean => {
  if (aId === bId) return true;
  const group = getMemberGroup(world, aId);
  return group !== undefined && group.memberIds.includes(bId);
};

/** 同一グループ OR 実効位置間距離 ≤ proximityRange（v8と同一規則） */
export const isAccessible = (
  world: World,
  actorId: number,
  targetId: number,
  proximityRange: number,
): boolean => {
  if (actorId === targetId) return true;
  const actor = getObject(world, actorId);
  const target = getObject(world, targetId);
  if (actor === undefined || target === undefined) return false;
  if (target.kind === 'group') return false;
  if (inSameGroup(world, actorId, targetId)) return true;
  return distance(effectivePosition(world, actor), effectivePosition(world, target)) <= proximityRange;
};

// === グループ構築ヘルパー ===

const setMemberOf = (world: World, componentId: number, groupId: number): World => {
  const component = getComponent(world, componentId);
  if (component === undefined) return world;
  return replaceObject(world, {
    ...component,
    groupId,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
  });
};

const setLone = (world: World, componentId: number, position: Position, velocity: Position): World => {
  const component = getComponent(world, componentId);
  if (component === undefined) return world;
  return replaceObject(world, { ...component, groupId: null, position, velocity });
};

/**
 * 新規コンポーネントを対象の辺に接続する。辺スロットは両側に設定済みであること。
 * 対象がグループ所属ならそこへ追加、単独なら2要素の新グループを作る。
 */
export const attachToTargetGroup = (
  world: World,
  newComponentId: number,
  targetId: number,
): World => {
  const target = getComponent(world, targetId);
  if (target === undefined) return world;

  if (target.groupId !== null) {
    const group = getGroup(world, target.groupId);
    if (group === undefined) return world;
    const updated: GroupObject = { ...group, memberIds: [...group.memberIds, newComponentId] };
    return setMemberOf(replaceObject(world, updated), newComponentId, group.id);
  }

  const targetPos = target.position;
  const targetVel = target.velocity;
  const { id: groupId, world: w1 } = nextObjectId(world);
  const group: GroupObject = {
    id: groupId,
    kind: 'group',
    position: targetPos,
    velocity: targetVel,
    memberIds: [targetId, newComponentId],
  };
  let w = addObject(w1, group);
  w = setMemberOf(w, targetId, groupId);
  w = setMemberOf(w, newComponentId, groupId);
  return w;
};

// === 接続の再計算 ===

/** 辺スロットから連結成分を計算する */
const connectedComponentsOf = (world: World, memberIds: readonly number[]): number[][] => {
  const memberSet = new Set(memberIds);
  const seen = new Set<number>();
  const result: number[][] = [];
  for (const start of [...memberIds].sort((a, b) => a - b)) {
    if (seen.has(start)) continue;
    const stack = [start];
    const componentIds: number[] = [];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      componentIds.push(current);
      const component = getComponent(world, current);
      if (component === undefined) continue;
      for (const peer of component.edges) {
        if (peer !== null && memberSet.has(peer) && !seen.has(peer)) stack.push(peer);
      }
    }
    result.push(componentIds.sort((a, b) => a - b));
  }
  return result;
};

/**
 * 辺変更・メンバー除去後のグループ再構築。
 * memberIds: 影響を受けた（元グループの）メンバー集合。
 * 元グループIDは「最小メンバーIDを含む成分」が維持する（決定論）。
 * サイズ1の成分は単独化する。位置・速度は元グループの値を引き継ぐ。
 */
export const rebuildGroups = (
  world: World,
  memberIds: readonly number[],
  originalGroupId: number | null,
  position: Position,
  velocity: Position,
): World => {
  const alive = memberIds.filter(id => getComponent(world, id) !== undefined);
  const components = connectedComponentsOf(world, alive);
  let w = world;
  let originalUsed = false;

  const sorted = [...components].sort((a, b) => a[0] - b[0]);
  for (const componentIds of sorted) {
    if (componentIds.length === 1) {
      w = setLone(w, componentIds[0], position, velocity);
      continue;
    }
    if (!originalUsed && originalGroupId !== null) {
      originalUsed = true;
      const group = getGroup(w, originalGroupId);
      if (group !== undefined) {
        w = replaceObject(w, { ...group, memberIds: componentIds, position, velocity });
        for (const id of componentIds) w = setMemberOf(w, id, originalGroupId);
        continue;
      }
    }
    const { id: groupId, world: w1 } = nextObjectId(w);
    w = addObject(w1, {
      id: groupId,
      kind: 'group',
      position,
      velocity,
      memberIds: componentIds,
    });
    for (const id of componentIds) w = setMemberOf(w, id, groupId);
  }

  if (originalGroupId !== null && !originalUsed) {
    w = removeObject(w, originalGroupId);
  }
  return w;
};

/** 2コンポーネント間の辺を切断し、グループを再計算する */
export const disconnectEdge = (
  world: World,
  actorId: number,
  targetId: number,
): { world: World; applied: boolean } => {
  const actor = getComponent(world, actorId);
  const target = getComponent(world, targetId);
  if (actor === undefined || target === undefined) return { world, applied: false };
  const actorEdge = actor.edges.findIndex(peer => peer === targetId);
  if (actorEdge < 0) return { world, applied: false };
  const targetEdge = target.edges.findIndex(peer => peer === actorId);

  let w = replaceObject(world, {
    ...actor,
    edges: actor.edges.map((peer, i) => (i === actorEdge ? null : peer)),
  });
  const target2 = getComponent(w, targetId)!;
  w = replaceObject(w, {
    ...target2,
    edges: target2.edges.map((peer, i) => (i === targetEdge ? null : peer)),
  });

  const group = getMemberGroup(w, actorId);
  if (group === undefined) return { world: w, applied: true };
  return {
    world: rebuildGroups(w, group.memberIds, group.id, group.position, group.velocity),
    applied: true,
  };
};

/** コンポーネントを世界から除去し、接続とグループを再計算する */
export const removeComponentAndRebuild = (world: World, componentId: number): World => {
  const component = getComponent(world, componentId);
  if (component === undefined) return world;
  const group = getMemberGroup(world, componentId);

  let w = world;
  for (const peerId of component.edges) {
    if (peerId === null) continue;
    const peer = getComponent(w, peerId);
    if (peer === undefined) continue;
    w = replaceObject(w, {
      ...peer,
      edges: peer.edges.map(p => (p === componentId ? null : p)),
    });
  }
  w = removeObject(w, componentId);

  if (group !== undefined) {
    const remaining = group.memberIds.filter(id => id !== componentId);
    w = rebuildGroups(w, remaining, group.id, group.position, group.velocity);
  }
  return w;
};

export const createEmptyWorld = (width: number, height: number): World => ({
  width,
  height,
  objects: [],
  nextObjectId: 1,
  tick: 0,
});

export { emptyEdges };
