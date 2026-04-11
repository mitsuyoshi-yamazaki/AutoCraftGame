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
} from '../src/world.js';
import type { EnergyObject, MaterialObject } from '../src/types.js';

describe('world', () => {
  it('createEmptyWorld creates an empty world', () => {
    const w = createEmptyWorld(100, 100);
    expect(w.width).toBe(100);
    expect(w.height).toBe(100);
    expect(w.objects).toHaveLength(0);
    expect(w.tick).toBe(0);
  });

  it('addObject adds an object', () => {
    const w = createEmptyWorld(100, 100);
    const obj: EnergyObject = {
      id: 'e1', kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    };
    const w2 = addObject(w, obj);
    expect(w2.objects).toHaveLength(1);
    expect(w2.objects[0].id).toBe('e1');
  });

  it('removeObject removes an object', () => {
    let w = createEmptyWorld(100, 100);
    const obj: EnergyObject = {
      id: 'e1', kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    };
    w = addObject(w, obj);
    w = removeObject(w, 'e1');
    expect(w.objects).toHaveLength(0);
  });

  it('replaceObject replaces an object', () => {
    let w = createEmptyWorld(100, 100);
    const obj: EnergyObject = {
      id: 'e1', kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    };
    w = addObject(w, obj);
    w = replaceObject(w, { ...obj, amount: 25 });
    const found = w.objects[0] as EnergyObject;
    expect(found.amount).toBe(25);
  });

  it('getObject finds an object by id', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, {
      id: 'e1', kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    } as EnergyObject);
    expect(getObject(w, 'e1')).toBeDefined();
    expect(getObject(w, 'e2')).toBeUndefined();
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
      id: 'e1', kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    } as EnergyObject);
    w = addObject(w, {
      id: 'e2', kind: 'energy', position: { x: 50, y: 50 }, orientation: 0, amount: 50,
    } as EnergyObject);

    const nearby = findNearbyObjects(w, { x: 11, y: 11 }, 5.0);
    expect(nearby).toHaveLength(1);
    expect(nearby[0].id).toBe('e1');
  });

  it('findNearbyObjects excludes self', () => {
    let w = createEmptyWorld(100, 100);
    w = addObject(w, {
      id: 'e1', kind: 'energy', position: { x: 10, y: 10 }, orientation: 0, amount: 50,
    } as EnergyObject);
    const nearby = findNearbyObjects(w, { x: 10, y: 10 }, 5.0, 'e1');
    expect(nearby).toHaveLength(0);
  });

  it('distance calculates euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
