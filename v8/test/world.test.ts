import { describe, it, expect } from 'vitest';
import {
  createEmptyWorld,
  addObject,
  removeObject,
  replaceObject,
  getObject,
  findNearbyObjects,
  nextObjectId,
  distance,
  createGroupWith,
  addMemberToGroup,
  disconnectEdge,
  isAccessible,
  effectivePosition,
  inSameGroup,
} from '../src/world.js';
import { createAssembler } from '../src/assembler.js';
import { createProcessor } from '../src/processor.js';
import type { EnergyObject, GroupObject } from '../src/types.js';

describe('world', () => {
  it('createEmptyWorld creates an empty world', () => {
    const w = createEmptyWorld(100, 100);
    expect(w.width).toBe(100);
    expect(w.height).toBe(100);
    expect(w.objects).toHaveLength(0);
    expect(w.tick).toBe(0);
    expect(w.nextObjectId).toBe(1);
  });

  it('addObject adds an object', () => {
    const w = createEmptyWorld(100, 100);
    const obj: EnergyObject = {
      id: 1, kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    };
    const w2 = addObject(w, obj);
    expect(w2.objects).toHaveLength(1);
    expect(w2.objects[0].id).toBe(1);
  });

  it('removeObject removes an object', () => {
    let w = createEmptyWorld(100, 100);
    const obj: EnergyObject = {
      id: 1, kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    };
    w = addObject(w, obj);
    w = removeObject(w, 1);
    expect(w.objects).toHaveLength(0);
  });

  it('replaceObject replaces an object', () => {
    let w = createEmptyWorld(100, 100);
    const obj: EnergyObject = {
      id: 1, kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    };
    w = addObject(w, obj);
    w = replaceObject(w, { ...obj, amount: 25 });
    const found = w.objects[0] as EnergyObject;
    expect(found.amount).toBe(25);
  });

  it('getObject finds an object by id', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, {
      id: 1, kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    } as EnergyObject);
    expect(getObject(w, 1)).toBeDefined();
    expect(getObject(w, 2)).toBeUndefined();
  });

  it('nextObjectId increments counter', () => {
    const w = createEmptyWorld(100, 100);
    const { id: id1, world: w2 } = nextObjectId(w);
    const { id: id2, world: w3 } = nextObjectId(w2);
    expect(id1).not.toBe(id2);
    expect(w3.nextObjectId).toBe(3);
  });

  it('findNearbyObjects returns objects within range', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, {
      id: 1, kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    } as EnergyObject);
    w = addObject(w, {
      id: 2, kind: 'energy', position: { x: 50, y: 50 }, orientation: 0, amount: 50,
    } as EnergyObject);

    const nearby = findNearbyObjects(w, { x: 11, y: 11 }, 5.0);
    expect(nearby).toHaveLength(1);
    expect(nearby[0].id).toBe(1);
  });

  it('findNearbyObjects excludes self', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, {
      id: 1, kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    } as EnergyObject);
    const nearby = findNearbyObjects(w, { x: 10, y: 10 }, 5.0, 1);
    expect(nearby).toHaveLength(0);
  });

  it('distance calculates euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  // ============================================================
  // v8 GroupObject / connection graph
  // ============================================================

  it('createGroupWith forms a group from two components and zeros their positions', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, createAssembler(1, { x: 10, y: 10 }));
    w = addObject(w, createProcessor(2, { x: 10, y: 11 }, [], false));
    w = { ...w, nextObjectId: 3 };

    const { world: w2, groupId } = createGroupWith(w, 1, 2, { x: 10, y: 10 });
    const group = getObject(w2, groupId) as GroupObject;
    expect(group.kind).toBe('group');
    expect(group.memberIds).toEqual([1, 2]);
    expect(group.edges).toHaveLength(1);

    const asm = getObject(w2, 1)!;
    const proc = getObject(w2, 2)!;
    expect((asm as any).groupId).toBe(groupId);
    expect((proc as any).groupId).toBe(groupId);
    expect(asm.position).toEqual({ x: 0, y: 0 });
    expect(proc.position).toEqual({ x: 0, y: 0 });
  });

  it('effectivePosition returns group position for grouped components', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, createAssembler(1, { x: 5, y: 5 }));
    w = addObject(w, createProcessor(2, { x: 5, y: 5 }, [], false));
    w = { ...w, nextObjectId: 3 };
    const { world: w2 } = createGroupWith(w, 1, 2, { x: 40, y: 40 });

    const asm = getObject(w2, 1)!;
    expect(effectivePosition(w2, asm)).toEqual({ x: 40, y: 40 });
  });

  it('isAccessible returns true for same-group components even far apart', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, createAssembler(1, { x: 0, y: 0 }));
    w = addObject(w, createProcessor(2, { x: 0, y: 0 }, [], false));
    w = { ...w, nextObjectId: 3 };
    const { world: w2 } = createGroupWith(w, 1, 2, { x: 0, y: 0 });

    expect(isAccessible(w2, 1, 2, 1.0)).toBe(true);
    expect(inSameGroup(w2, 1, 2)).toBe(true);
  });

  it('isAccessible returns true for nearby but ungrouped components within range', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, createAssembler(1, { x: 10, y: 10 }));
    w = addObject(w, createProcessor(2, { x: 11, y: 10 }, [], false));

    expect(isAccessible(w, 1, 2, 3.0)).toBe(true);
    expect(isAccessible(w, 1, 2, 0.5)).toBe(false);
  });

  it('addMemberToGroup adds a third member with edge to existing peer', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, createAssembler(1, { x: 0, y: 0 }));
    w = addObject(w, createProcessor(2, { x: 0, y: 0 }, [], false));
    w = addObject(w, createProcessor(3, { x: 0, y: 0 }, [], false));
    w = { ...w, nextObjectId: 4 };
    const { world: w2, groupId } = createGroupWith(w, 1, 2, { x: 5, y: 5 });
    const w3 = addMemberToGroup(w2, groupId, 3, 2);

    const group = getObject(w3, groupId) as GroupObject;
    expect(group.memberIds).toEqual([1, 2, 3]);
    expect(group.edges).toHaveLength(2);
    expect(inSameGroup(w3, 1, 3)).toBe(true);
  });

  it('disconnectEdge splits a group when removing the sole bridge', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, createAssembler(1, { x: 0, y: 0 }));
    w = addObject(w, createProcessor(2, { x: 0, y: 0 }, [], false));
    w = addObject(w, createProcessor(3, { x: 0, y: 0 }, [], false));
    w = { ...w, nextObjectId: 4 };

    // Build group as chain: 1 - 2 - 3
    const { world: w2, groupId } = createGroupWith(w, 1, 2, { x: 5, y: 5 });
    const w3 = addMemberToGroup(w2, groupId, 3, 2);

    // Disconnect edge 2-3 → splits off 3 as freestanding (single-member => no group)
    const { world: w4, applied } = disconnectEdge(w3, 2, 3);
    expect(applied).toBe(true);
    expect(inSameGroup(w4, 2, 3)).toBe(false);

    // Original group still contains 1 and 2
    const group = getObject(w4, groupId) as GroupObject;
    expect(group.memberIds).toEqual([1, 2]);

    // 3 is freestanding (groupId=null), placed at original group position
    const three = getObject(w4, 3)!;
    expect((three as any).groupId).toBeNull();
    expect(three.position).toEqual({ x: 5, y: 5 });
  });

  it('disconnectEdge dissolves a 2-member group when the only edge is removed', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, createAssembler(1, { x: 0, y: 0 }));
    w = addObject(w, createProcessor(2, { x: 0, y: 0 }, [], false));
    w = { ...w, nextObjectId: 3 };
    const { world: w2, groupId } = createGroupWith(w, 1, 2, { x: 7, y: 7 });

    const { world: w3, applied } = disconnectEdge(w2, 1, 2);
    expect(applied).toBe(true);

    // Both members now freestanding
    const a = getObject(w3, 1)!;
    const b = getObject(w3, 2)!;
    expect((a as any).groupId).toBeNull();
    expect((b as any).groupId).toBeNull();
    // Group object removed
    expect(getObject(w3, groupId)).toBeUndefined();
  });
});
