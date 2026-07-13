/**
 * Storage経済 — グループ単位のエネルギー・物質の格納/引当/散布。
 * 引落・格納は常にStorageのID昇順（決定論）。仕様: docs/specs/02_components.md, 04_craft_energy.md
 */

import type { GameParams } from '../params';
import { atomsPerUnit } from './codes';
import type { Position, StorageComponent, World } from './types';
import { isWreck } from './types';
import { distance, getComponent, getMemberGroup, getObject, replaceObject } from './world';

/** メンバーと同グループの機能中Storage一覧（ID昇順）。単独Storageは自身のみ */
export const groupStorages = (world: World, memberId: number): StorageComponent[] => {
  const group = getMemberGroup(world, memberId);
  const candidateIds = group !== undefined ? group.memberIds : [memberId];
  return candidateIds
    .map(id => getComponent(world, id))
    .filter(
      (c): c is StorageComponent =>
        c !== undefined && c.componentType === 'Storage' && !isWreck(c),
    )
    .sort((a, b) => a.id - b.id);
};

export const groupEnergy = (world: World, memberId: number): number =>
  groupStorages(world, memberId).reduce((sum, storage) => sum + storage.energy, 0);

export const groupItemCount = (world: World, memberId: number, substanceCode: number): number =>
  groupStorages(world, memberId).reduce(
    (sum, storage) => sum + (storage.items.get(substanceCode) ?? 0),
    0,
  );

export const storedAtoms = (storage: StorageComponent): number =>
  [...storage.items.entries()].reduce(
    (sum, [code, count]) => sum + atomsPerUnit(code) * count,
    0,
  );

/** エネルギーを引き落とす（全額 or 失敗）。ID昇順に消費 */
export const withdrawEnergy = (
  world: World,
  memberId: number,
  amount: number,
): { world: World; paid: boolean } => {
  if (amount <= 0) return { world, paid: true };
  const storages = groupStorages(world, memberId);
  const total = storages.reduce((sum, s) => sum + s.energy, 0);
  if (total < amount) return { world, paid: false };
  let remaining = amount;
  let w = world;
  for (const storage of storages) {
    if (remaining <= 0) break;
    const take = Math.min(storage.energy, remaining);
    if (take > 0) {
      remaining -= take;
      w = replaceObject(w, { ...storage, energy: storage.energy - take });
    }
  }
  return { world: w, paid: true };
};

/** エネルギーを充填する。容量超過分は消滅（熱化）。充填できた量を返す */
export const depositEnergy = (
  world: World,
  memberId: number,
  amount: number,
  params: GameParams,
): { world: World; deposited: number } => {
  let remaining = amount;
  let w = world;
  for (const storage of groupStorages(world, memberId)) {
    if (remaining <= 0) break;
    const free = params.energyCapacity - storage.energy;
    const put = Math.min(free, remaining);
    if (put > 0) {
      remaining -= put;
      w = replaceObject(w, { ...storage, energy: storage.energy + put });
    }
  }
  return { world: w, deposited: amount - remaining };
};

/** 物質を引き当てる（要求の全量 or 失敗）。ID昇順に消費 */
export const withdrawItems = (
  world: World,
  memberId: number,
  substanceCode: number,
  count: number,
): { world: World; taken: boolean } => {
  if (count <= 0) return { world, taken: true };
  if (groupItemCount(world, memberId, substanceCode) < count) return { world, taken: false };
  let remaining = count;
  let w = world;
  for (const storage of groupStorages(world, memberId)) {
    if (remaining <= 0) break;
    const have = storage.items.get(substanceCode) ?? 0;
    const take = Math.min(have, remaining);
    if (take > 0) {
      remaining -= take;
      const items = new Map(storage.items);
      if (have - take === 0) {
        items.delete(substanceCode);
      } else {
        items.set(substanceCode, have - take);
      }
      w = replaceObject(w, { ...storage, items });
    }
  }
  return { world: w, taken: true };
};

/** 物質を格納する。容量（総原子数）不足分は格納されず残数を返す */
export const depositItems = (
  world: World,
  memberId: number,
  substanceCode: number,
  count: number,
  params: GameParams,
): { world: World; leftover: number } => {
  const unitAtoms = atomsPerUnit(substanceCode);
  if (unitAtoms <= 0) return { world, leftover: 0 };
  let remaining = count;
  let w = world;
  for (const storage of groupStorages(world, memberId)) {
    if (remaining <= 0) break;
    const current = getComponent(w, storage.id) as StorageComponent;
    const freeAtoms = params.matterCapacity - storedAtoms(current);
    const put = Math.min(Math.floor(freeAtoms / unitAtoms), remaining);
    if (put > 0) {
      remaining -= put;
      const items = new Map(current.items);
      items.set(substanceCode, (items.get(substanceCode) ?? 0) + put);
      w = replaceObject(w, { ...current, items });
    }
  }
  return { world: w, leftover: remaining };
};

const GROUND_MERGE_RANGE = 0.5;

/** 物質を地面に散布する。近傍の同種の山があればまとめる */
export const dropItems = (
  world: World,
  position: Position,
  substanceCode: number,
  count: number,
): World => {
  if (count <= 0) return world;
  const existing = world.objects.find(
    o =>
      o.kind === 'ground' &&
      o.substanceCode === substanceCode &&
      distance(o.position, position) <= GROUND_MERGE_RANGE,
  );
  if (existing !== undefined && existing.kind === 'ground') {
    return replaceObject(world, { ...existing, count: existing.count + count });
  }
  const id = world.nextObjectId;
  return {
    ...world,
    nextObjectId: id + 1,
    objects: [
      ...world.objects,
      { id, kind: 'ground', position, substanceCode, count },
    ],
  };
};

/** エネルギーを地面に散布する（Storage残骸の分解時等） */
export const dropEnergy = (world: World, position: Position, amount: number): World => {
  if (amount <= 0) return world;
  const id = world.nextObjectId;
  return {
    ...world,
    nextObjectId: id + 1,
    objects: [...world.objects, { id, kind: 'energyPile', position, amount }],
  };
};

/** 格納を試み、入り切らなかった分を散布する */
export const depositOrDrop = (
  world: World,
  memberId: number,
  position: Position,
  substanceCode: number,
  count: number,
  params: GameParams,
): World => {
  const { world: w, leftover } = depositItems(world, memberId, substanceCode, count, params);
  return leftover > 0 ? dropItems(w, position, substanceCode, leftover) : w;
};

/** Storageの中身をその場に散布する（分解・崩壊時） */
export const scatterStorageContents = (world: World, storageId: number): World => {
  const storage = getComponent(world, storageId);
  if (storage === undefined || storage.componentType !== 'Storage') return world;
  const position = effectivePositionOf(world, storageId);
  let w = world;
  for (const [code, count] of [...storage.items.entries()].sort(([a], [b]) => a - b)) {
    w = dropItems(w, position, code, count);
  }
  if (storage.energy > 0) {
    w = dropEnergy(w, position, storage.energy);
  }
  const cleared = getComponent(w, storageId);
  if (cleared !== undefined && cleared.componentType === 'Storage') {
    w = replaceObject(w, { ...cleared, items: new Map(), energy: 0 });
  }
  return w;
};

const effectivePositionOf = (world: World, objectId: number): Position => {
  const obj = getObject(world, objectId);
  if (obj === undefined) return { x: 0, y: 0 };
  if (obj.kind === 'component' && obj.groupId !== null) {
    const group = getObject(world, obj.groupId);
    if (group !== undefined && group.kind === 'group') return group.position;
  }
  return obj.position;
};
