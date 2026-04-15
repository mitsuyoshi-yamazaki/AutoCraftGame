/**
 * World helpers — object management, proximity queries, group helpers, connection graph ops.
 */

import type {
  World,
  WorldObject,
  Position,
  GroupObject,
  ComponentObject,
} from './types.js';

// ============================================================
// Distance
// ============================================================
export function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================
// Object ID management
// ============================================================
export function nextObjectId(world: World): { id: number; world: World } {
  const id = world.nextObjectId;
  return { id, world: { ...world, nextObjectId: world.nextObjectId + 1 } };
}

// ============================================================
// Object CRUD
// ============================================================
export function addObject(world: World, obj: WorldObject): World {
  return { ...world, objects: [...world.objects, obj] };
}

export function removeObject(world: World, id: number): World {
  return { ...world, objects: world.objects.filter(o => o.id !== id) };
}

export function replaceObject(world: World, obj: WorldObject): World {
  return {
    ...world,
    objects: world.objects.map(o => o.id === obj.id ? obj : o),
  };
}

export function getObject(world: World, id: number): WorldObject | undefined {
  return world.objects.find(o => o.id === id);
}

export function getGroup(world: World, id: number): GroupObject | undefined {
  const o = getObject(world, id);
  return o && o.kind === 'group' ? o : undefined;
}

// ============================================================
// Effective position
// ============================================================
/** Returns the effective position of an object (group position if grouped, own position otherwise). */
export function effectivePosition(world: World, obj: WorldObject): Position {
  if (obj.kind === 'assembler' || obj.kind === 'processor') {
    if (obj.groupId !== null) {
      const g = getGroup(world, obj.groupId);
      if (g) return g.position;
    }
  }
  return obj.position;
}

// ============================================================
// Proximity queries (uses effective position)
// ============================================================
export function findNearbyObjects(
  world: World,
  position: Position,
  range: number,
  excludeId?: number,
): readonly WorldObject[] {
  return world.objects.filter(o => {
    if (o.id === excludeId) return false;
    if (o.kind === 'group') return false;  // groups are not directly addressable via SCAN
    return distance(position, effectivePosition(world, o)) <= range;
  });
}

// ============================================================
// Group membership
// ============================================================
export function getMemberGroup(world: World, componentId: number): GroupObject | undefined {
  const c = getObject(world, componentId);
  if (!c) return undefined;
  if (c.kind !== 'assembler' && c.kind !== 'processor') return undefined;
  if (c.groupId === null) return undefined;
  return getGroup(world, c.groupId);
}

export function inSameGroup(world: World, aId: number, bId: number): boolean {
  if (aId === bId) return true;
  const ga = getMemberGroup(world, aId);
  if (!ga) return false;
  return ga.memberIds.includes(bId);
}

/** True iff target is accessible from actor: proximity OR same group. */
export function isAccessible(
  world: World,
  actorId: number,
  targetId: number,
  proximityRange: number,
): boolean {
  if (actorId === targetId) return true;
  const actor = getObject(world, actorId);
  const target = getObject(world, targetId);
  if (!actor || !target) return false;
  if (target.kind === 'group') return false;
  if (inSameGroup(world, actorId, targetId)) return true;
  const ap = effectivePosition(world, actor);
  const tp = effectivePosition(world, target);
  return distance(ap, tp) <= proximityRange;
}

// ============================================================
// World factory
// ============================================================
export function createEmptyWorld(width: number, height: number): World {
  return {
    width,
    height,
    objects: [],
    nextObjectId: 1,
    tick: 0,
  };
}

// ============================================================
// Connection graph operations
// ============================================================

/** Creates a new group containing the two components at the given position. */
export function createGroupWith(
  world: World,
  aId: number,
  bId: number,
  position: Position,
): { world: World; groupId: number } {
  const { id: groupId, world: w1 } = nextObjectId(world);
  const group: GroupObject = {
    id: groupId,
    kind: 'group',
    position,
    orientation: 0,
    memberIds: [aId, bId],
    edges: [[aId, bId] as const],
  };
  let w = addObject(w1, group);
  w = setGroupIdAndZeroPos(w, aId, groupId);
  w = setGroupIdAndZeroPos(w, bId, groupId);
  return { world: w, groupId };
}

/** Adds a new member to an existing group with a single edge to a peer. */
export function addMemberToGroup(
  world: World,
  groupId: number,
  memberId: number,
  edgePeerId: number,
): World {
  const g = getGroup(world, groupId);
  if (!g) return world;
  const newGroup: GroupObject = {
    ...g,
    memberIds: [...g.memberIds, memberId],
    edges: [...g.edges, [memberId, edgePeerId] as const],
  };
  let w = replaceObject(world, newGroup);
  w = setGroupIdAndZeroPos(w, memberId, groupId);
  return w;
}

/** Sets groupId on a component and zeroes its position (grouped members live at local (0,0)). */
function setGroupIdAndZeroPos(world: World, componentId: number, groupId: number | null): World {
  const o = getObject(world, componentId);
  if (!o || (o.kind !== 'assembler' && o.kind !== 'processor')) return world;
  const updated: ComponentObject = {
    ...(o as ComponentObject),
    groupId,
    position: groupId !== null ? { x: 0, y: 0 } : o.position,
  };
  return replaceObject(world, updated);
}

function setGroupIdAbsPos(
  world: World,
  componentId: number,
  groupId: number | null,
  absPos: Position,
): World {
  const o = getObject(world, componentId);
  if (!o || (o.kind !== 'assembler' && o.kind !== 'processor')) return world;
  const updated: ComponentObject = {
    ...(o as ComponentObject),
    groupId,
    position: groupId === null ? absPos : { x: 0, y: 0 },
  };
  return replaceObject(world, updated);
}

/**
 * Removes a direct edge between actor and target.
 * If removal splits the group, creates a new group for the separated component(s).
 * A 1-member separated component becomes freestanding (group dissolved).
 */
export function disconnectEdge(
  world: World,
  actorId: number,
  targetId: number,
): { world: World; applied: boolean; newGroupId?: number; dissolvedGroupId?: number } {
  const group = getMemberGroup(world, actorId);
  if (!group) return { world, applied: false };
  if (!group.memberIds.includes(targetId)) return { world, applied: false };

  const edgeExists = group.edges.some(e =>
    (e[0] === actorId && e[1] === targetId) || (e[0] === targetId && e[1] === actorId));
  if (!edgeExists) return { world, applied: false };

  const newEdges = group.edges.filter(e =>
    !((e[0] === actorId && e[1] === targetId) || (e[0] === targetId && e[1] === actorId)));

  const components = connectedComponents(group.memberIds, newEdges);

  if (components.length <= 1) {
    const updated: GroupObject = { ...group, edges: newEdges };
    return { world: replaceObject(world, updated), applied: true };
  }

  // Split: keep actor's component in the original group, move the other(s) out
  const actorComp = components.find(c => c.includes(actorId))!;
  const others = components.filter(c => c !== actorComp);

  let w = world;
  let newGroupId: number | undefined;
  let dissolvedGroupId: number | undefined;

  if (actorComp.length >= 2) {
    const keepEdges = newEdges.filter(e => actorComp.includes(e[0]) && actorComp.includes(e[1]));
    const updated: GroupObject = { ...group, memberIds: actorComp, edges: keepEdges };
    w = replaceObject(w, updated);
  }

  for (const comp of others) {
    if (comp.length === 1) {
      const memberId = comp[0];
      w = setGroupIdAbsPos(w, memberId, null, group.position);
    } else {
      const { id: gid, world: w2 } = nextObjectId(w);
      w = w2;
      const compEdges = newEdges.filter(e => comp.includes(e[0]) && comp.includes(e[1]));
      const newG: GroupObject = {
        id: gid,
        kind: 'group',
        position: group.position,
        orientation: 0,
        memberIds: comp,
        edges: compEdges,
      };
      w = addObject(w, newG);
      for (const m of comp) {
        const c = getObject(w, m);
        if (c && (c.kind === 'assembler' || c.kind === 'processor')) {
          w = replaceObject(w, { ...(c as ComponentObject), groupId: gid });
        }
      }
      newGroupId = gid;
    }
  }

  if (actorComp.length === 1) {
    w = setGroupIdAbsPos(w, actorId, null, group.position);
    w = removeObject(w, group.id);
    dissolvedGroupId = group.id;
  }

  return { world: w, applied: true, newGroupId, dissolvedGroupId };
}

/** Computes connected components of an undirected graph. */
function connectedComponents(
  nodes: readonly number[],
  edges: readonly (readonly [number, number])[],
): number[][] {
  const adj = new Map<number, number[]>();
  for (const n of nodes) adj.set(n, []);
  for (const [a, b] of edges) {
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  const seen = new Set<number>();
  const components: number[][] = [];
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const stack = [start];
    const comp: number[] = [];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      comp.push(n);
      for (const m of adj.get(n) ?? []) if (!seen.has(m)) stack.push(m);
    }
    components.push(comp);
  }
  return components;
}
