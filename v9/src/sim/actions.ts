/**
 * コンポーネントアクションフェーズ（フェーズ2）。
 * 2-1: DISCONNECT（Processor、ID昇順） → 2-2: 各コンポーネントのアクション（ID昇順）。
 * 仕様: docs/specs/00_world_objects.md, 02_components.md
 */

import type { GameParams } from '../params';
import { processAssembler } from './actions-assembler';
import {
  atomsPerUnit,
  disassemblyRecipeFor,
  substanceCodeOf,
  typeCodeOf,
  TYPE_CODE_ENERGY_NODE,
  TYPE_CODE_SUBSTANCE_BASE,
} from './codes';
import { withOpmemPatch } from './components';
import { damageComponent, releaseInProgressMaterials } from './lifecycle';
import {
  DIS_OFF_PROGRESS,
  DIS_OFF_RESULT,
  DIS_OFF_STATUS,
  DIS_OFF_TARGET,
  DIS_OFF_TRIGGER,
  HARV_OFF_FILTER,
  HARV_OFF_LAST_AMOUNT,
  HARV_OFF_LAST_TYPE,
  HARV_OFF_RESULT,
  HARV_OFF_TRIGGER,
  PROC_OFF_CSCAN_COUNT,
  PROC_OFF_CSCAN_FILTER,
  PROC_OFF_CSCAN_RESULTS,
  PROC_OFF_CSCAN_TRIGGER,
  PROC_OFF_DISCONNECT_TARGET,
  PROC_OFF_DISCONNECT_TRIGGER,
  RESULT_NO_CAPACITY,
  RESULT_NO_ENERGY,
  RESULT_SUCCESS,
  RESULT_UNREACHABLE,
  SCAN_ENTRY_WORDS,
  SENS_OFF_COUNT,
  SENS_OFF_FILTER,
  SENS_OFF_RESULTS,
  SENS_OFF_TRIGGER,
  STOR_OFF_AMOUNT,
  STOR_OFF_QUERY_CODE,
  STOR_OFF_QUERY_COUNT,
  STOR_OFF_RESULT,
  STOR_OFF_STORED_ATOMS,
  STOR_OFF_STORED_ENERGY,
  STOR_OFF_SUBSTANCE_CODE,
  STOR_OFF_TARGET,
  STOR_OFF_TRANSFER_TRIGGER,
} from './opmem';
import {
  depositEnergy,
  depositItems,
  depositOrDrop,
  groupEnergy,
  scatterStorageContents,
  storedAtoms,
  withdrawEnergy,
} from './storage';
import type {
  ComponentObject,
  DisassemblerComponent,
  ProcessorComponent,
  SimulationEvent,
  StorageComponent,
  World,
  WorldObject,
} from './types';
import { isWreck } from './types';
import {
  allComponents,
  disconnectEdge,
  distance,
  effectivePosition,
  getComponent,
  getMemberGroup,
  isAccessible,
  removeComponentAndRebuild,
  removeObject,
  replaceObject,
} from './world';

const applyWear = (world: World, componentId: number, events: SimulationEvent[]): World =>
  damageComponent(world, componentId, 1, events);

const patchOpmem = (
  world: World,
  componentId: number,
  patch: ReadonlyArray<readonly [number, number]>,
): World => {
  const component = getComponent(world, componentId);
  if (component === undefined) return world;
  return replaceObject(world, withOpmemPatch(component, patch));
};

// === DISCONNECT（フェーズ2-1） ===

const processDisconnects = (world: World): World => {
  let w = world;
  const processorIds = allComponents(w)
    .filter((c): c is ProcessorComponent => c.componentType === 'Processor' && !isWreck(c))
    .filter(c => c.opmem[PROC_OFF_DISCONNECT_TRIGGER] === 1)
    .map(c => c.id)
    .sort((a, b) => a - b);
  for (const id of processorIds) {
    const current = getComponent(w, id) as ProcessorComponent | undefined;
    if (current === undefined) continue;
    const targetObjectId = current.localIdTable.get(current.opmem[PROC_OFF_DISCONNECT_TARGET]);
    w = patchOpmem(w, id, [[PROC_OFF_DISCONNECT_TRIGGER, 0]]);
    if (targetObjectId !== undefined) {
      w = disconnectEdge(w, id, targetObjectId).world;
    }
  }
  return w;
};

// === Harvester ===

type Harvestable =
  | { readonly kind: 'matter'; readonly obj: WorldObject & { readonly kind: 'matterNode' | 'ground' }; readonly substanceCode: number }
  | { readonly kind: 'energy'; readonly obj: WorldObject & { readonly kind: 'energyNode' | 'energyPile' } };

const harvestCandidates = (world: World, filter: number): Harvestable[] => {
  const result: Harvestable[] = [];
  for (const obj of world.objects) {
    if (obj.kind === 'matterNode' && obj.remaining > 0) {
      if (filter === 0 || filter === TYPE_CODE_SUBSTANCE_BASE + obj.substanceCode) {
        result.push({ kind: 'matter', obj, substanceCode: obj.substanceCode });
      }
    } else if (obj.kind === 'ground' && obj.count > 0) {
      if (filter === 0 || filter === TYPE_CODE_SUBSTANCE_BASE + obj.substanceCode) {
        result.push({ kind: 'matter', obj, substanceCode: obj.substanceCode });
      }
    } else if (obj.kind === 'energyNode' || obj.kind === 'energyPile') {
      if (filter === 0 || filter === TYPE_CODE_ENERGY_NODE) {
        result.push({ kind: 'energy', obj });
      }
    }
  }
  return result;
};

const harvestEnergyFrom = (
  world: World,
  harvesterId: number,
  target: Harvestable & { readonly kind: 'energy' },
  params: GameParams,
): { world: World; amount: number } => {
  const node = target.obj;
  const available =
    node.kind === 'energyNode' ? Math.max(0, params.energyNodeFlow - node.flowUsed) : node.amount;
  const want = Math.min(params.harvestEnergyRate, available);
  if (want <= 0) return { world, amount: 0 };
  const { world: w1, deposited } = depositEnergy(world, harvesterId, want, params);
  if (deposited <= 0) return { world, amount: 0 };
  if (node.kind === 'energyNode') {
    return {
      world: replaceObject(w1, { ...node, flowUsed: node.flowUsed + deposited }),
      amount: deposited,
    };
  }
  const remaining = node.amount - deposited;
  return {
    world: remaining > 0 ? replaceObject(w1, { ...node, amount: remaining }) : removeObject(w1, node.id),
    amount: deposited,
  };
};

const processHarvester = (
  world: World,
  harvesterId: number,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const harvester = getComponent(world, harvesterId);
  if (harvester === undefined || isWreck(harvester)) return world;
  if (harvester.opmem[HARV_OFF_TRIGGER] !== 1) return world;

  const fail = (code: number): World =>
    patchOpmem(world, harvesterId, [
      [HARV_OFF_TRIGGER, 0],
      [HARV_OFF_RESULT, code],
    ]);

  const filter = harvester.opmem[HARV_OFF_FILTER];
  const position = effectivePosition(world, harvester);
  const candidates = harvestCandidates(world, filter)
    .map(candidate => ({ candidate, dist: distance(position, candidate.obj.position) }))
    .filter(({ dist }) => dist <= params.proximityRange)
    .sort((a, b) => a.dist - b.dist || a.candidate.obj.id - b.candidate.obj.id);

  if (candidates.length === 0) return fail(RESULT_UNREACHABLE);
  if (groupEnergy(world, harvesterId) < params.harvestActionCost) return fail(RESULT_NO_ENERGY);

  const { candidate } = candidates[0];
  let w = world;
  let harvestedType = 0;
  let harvestedAmount = 0;

  if (candidate.kind === 'energy') {
    const result = harvestEnergyFrom(w, harvesterId, candidate, params);
    if (result.amount <= 0) return fail(RESULT_NO_CAPACITY);
    w = result.world;
    harvestedType = TYPE_CODE_ENERGY_NODE;
    harvestedAmount = result.amount;
  } else {
    const stock = candidate.obj.kind === 'matterNode' ? candidate.obj.remaining : candidate.obj.count;
    const rate = Math.min(params.harvestMatterRate, stock);
    const { world: w1, leftover } = depositItems(w, harvesterId, candidate.substanceCode, rate, params);
    const stored = rate - leftover;
    if (stored <= 0) return fail(RESULT_NO_CAPACITY);
    w = w1;
    if (candidate.obj.kind === 'matterNode') {
      const remaining = candidate.obj.remaining - stored;
      w = remaining > 0 ? replaceObject(w, { ...candidate.obj, remaining }) : removeObject(w, candidate.obj.id);
    } else {
      const count = candidate.obj.count - stored;
      w = count > 0 ? replaceObject(w, { ...candidate.obj, count }) : removeObject(w, candidate.obj.id);
    }
    harvestedType = TYPE_CODE_SUBSTANCE_BASE + candidate.substanceCode;
    harvestedAmount = stored;
  }

  w = withdrawEnergy(w, harvesterId, params.harvestActionCost).world;
  w = applyWear(w, harvesterId, events);
  return patchOpmem(w, harvesterId, [
    [HARV_OFF_TRIGGER, 0],
    [HARV_OFF_RESULT, RESULT_SUCCESS],
    [HARV_OFF_LAST_TYPE, harvestedType],
    [HARV_OFF_LAST_AMOUNT, harvestedAmount],
  ]);
};

// === Disassembler ===

const finishDisassembler = (world: World, disassemblerId: number, result: number): World => {
  const current = getComponent(world, disassemblerId);
  if (current === undefined || current.componentType !== 'Disassembler') return world;
  const updated: DisassemblerComponent = { ...current, ticksRemaining: 0, targetObjectId: 0 };
  return patchOpmem(replaceObject(world, updated), disassemblerId, [
    [DIS_OFF_STATUS, 0],
    [DIS_OFF_PROGRESS, 0],
    [DIS_OFF_RESULT, result],
  ]);
};

const completeDisassemble = (
  world: World,
  disassemblerId: number,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const disassembler = getComponent(world, disassemblerId) as DisassemblerComponent | undefined;
  if (disassembler === undefined) return world;
  const targetId = disassembler.targetObjectId;
  const target = getComponent(world, targetId);

  if (target === undefined || !isAccessible(world, disassemblerId, targetId, params.proximityRange)) {
    return finishDisassembler(world, disassemblerId, RESULT_UNREACHABLE);
  }

  let w = world;
  if (target.componentType === 'Storage') {
    w = scatterStorageContents(w, targetId);
  }
  // 作業中Assemblerの消費済み材料を散布してから除去する（原子保存）
  const targetCurrent = getComponent(w, targetId);
  if (targetCurrent !== undefined) {
    w = releaseInProgressMaterials(w, targetCurrent);
  }
  const recipe = disassemblyRecipeFor(target.componentType);
  const componentType = target.componentType;
  w = removeComponentAndRebuild(w, targetId);
  const self = getComponent(w, disassemblerId);
  if (self === undefined) return w; // 自己分解した場合
  const selfPosition = effectivePosition(w, self);
  for (const output of recipe.outputs) {
    w = depositOrDrop(w, disassemblerId, selfPosition, substanceCodeOf(output.substanceId), output.count, params);
  }
  events.push({ type: 'component_removed', id: targetId, componentType, cause: 'disassembled' });
  return finishDisassembler(w, disassemblerId, RESULT_SUCCESS);
};

const processDisassembler = (
  world: World,
  disassemblerId: number,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const disassembler = getComponent(world, disassemblerId);
  if (disassembler === undefined || disassembler.componentType !== 'Disassembler' || isWreck(disassembler)) {
    return world;
  }

  if (disassembler.ticksRemaining > 0) {
    const remaining = disassembler.ticksRemaining - 1;
    const updated: DisassemblerComponent = { ...disassembler, ticksRemaining: remaining };
    const w = replaceObject(world, updated);
    if (remaining > 0) {
      return patchOpmem(w, disassemblerId, [[DIS_OFF_PROGRESS, remaining]]);
    }
    return completeDisassemble(w, disassemblerId, params, events);
  }

  if (disassembler.opmem[DIS_OFF_TRIGGER] !== 1) return world;
  const targetId = disassembler.opmem[DIS_OFF_TARGET];
  const target = getComponent(world, targetId);

  const fail = (code: number): World =>
    patchOpmem(world, disassemblerId, [
      [DIS_OFF_TRIGGER, 0],
      [DIS_OFF_RESULT, code],
    ]);

  if (target === undefined || !isAccessible(world, disassemblerId, targetId, params.proximityRange)) {
    return fail(RESULT_UNREACHABLE);
  }
  const { world: w1, paid } = withdrawEnergy(world, disassemblerId, params.disassembleActionCost);
  if (!paid) return fail(RESULT_NO_ENERGY);
  const w2 = applyWear(w1, disassemblerId, events);
  const current = getComponent(w2, disassemblerId) as DisassemblerComponent;
  const updated: DisassemblerComponent = {
    ...current,
    ticksRemaining: params.disassembleTicks,
    targetObjectId: targetId,
  };
  return patchOpmem(replaceObject(w2, updated), disassemblerId, [
    [DIS_OFF_TRIGGER, 0],
    [DIS_OFF_STATUS, 1],
    [DIS_OFF_PROGRESS, params.disassembleTicks],
    [DIS_OFF_RESULT, 0],
  ]);
};

// === Sensor ===

const scanAux = (obj: WorldObject, params: GameParams): number => {
  switch (obj.kind) {
    case 'component':
      return Math.min(0xffff, Math.max(0, obj.durability));
    case 'matterNode':
      return Math.min(0xffff, obj.remaining);
    case 'ground':
      return Math.min(0xffff, obj.count);
    case 'energyNode':
      return Math.min(0xffff, Math.max(0, params.energyNodeFlow - obj.flowUsed));
    case 'energyPile':
      return Math.min(0xffff, obj.amount);
    case 'group':
      return 0;
  }
};

const matchScanFilter = (obj: WorldObject, filter: number, typeCode: number): boolean => {
  if (filter === 0) return true;
  if (filter >= 1 && filter <= 8) return typeCode === filter;
  if (filter === 9) return obj.kind === 'matterNode' || obj.kind === 'ground';
  if (filter === 10) return obj.kind === 'energyNode' || obj.kind === 'energyPile';
  return true;
};

const processSensor = (
  world: World,
  sensorId: number,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const sensor = getComponent(world, sensorId);
  if (sensor === undefined || isWreck(sensor)) return world;
  if (sensor.opmem[SENS_OFF_TRIGGER] !== 1) return world;

  const { world: w1, paid } = withdrawEnergy(world, sensorId, params.scanEnergy);
  if (!paid) {
    return patchOpmem(world, sensorId, [
      [SENS_OFF_TRIGGER, 0],
      [SENS_OFF_COUNT, 0],
    ]);
  }

  const filter = sensor.opmem[SENS_OFF_FILTER];
  const position = effectivePosition(w1, sensor);
  const group = getMemberGroup(w1, sensorId);
  const memberIds = new Set(group?.memberIds ?? [sensorId]);

  // 同グループのメンバーは対象外（グループ内はProcessorのCSCANが担う）
  const found = w1.objects
    .filter(obj => obj.kind !== 'group' && obj.id !== sensorId)
    .filter(obj => !(obj.kind === 'component' && memberIds.has(obj.id)))
    .map(obj => ({ obj, dist: distance(position, effectivePosition(w1, obj)) }))
    .filter(({ dist }) => dist <= params.scanRange)
    .filter(({ obj }) => matchScanFilter(obj, filter, typeCodeOf(obj)))
    .sort((a, b) => a.dist - b.dist || a.obj.id - b.obj.id)
    .slice(0, params.scanMaxResults);

  const patch: Array<readonly [number, number]> = [
    [SENS_OFF_TRIGGER, 0],
    [SENS_OFF_COUNT, found.length],
  ];
  for (let i = 0; i < params.scanMaxResults; i++) {
    const base = SENS_OFF_RESULTS + i * SCAN_ENTRY_WORDS;
    if (i < found.length) {
      const { obj, dist } = found[i];
      patch.push([base + 0, obj.id & 0xffff]);
      patch.push([base + 1, typeCodeOf(obj)]);
      patch.push([base + 2, Math.floor(dist)]);
      patch.push([base + 3, scanAux(obj, params)]);
    } else {
      patch.push([base + 0, 0], [base + 1, 0], [base + 2, 0], [base + 3, 0]);
    }
  }
  return applyWear(patchOpmem(w1, sensorId, patch), sensorId, events);
};

// === Storage TRANSFER ===

const executeTransfer = (
  world: World,
  storage: StorageComponent,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const targetId = storage.opmem[STOR_OFF_TARGET];
  const substanceCode = storage.opmem[STOR_OFF_SUBSTANCE_CODE];
  const amount = storage.opmem[STOR_OFF_AMOUNT];

  const fail = (code: number): World =>
    patchOpmem(world, storage.id, [
      [STOR_OFF_TRANSFER_TRIGGER, 0],
      [STOR_OFF_RESULT, code],
    ]);

  const target = getComponent(world, targetId);
  if (
    target === undefined ||
    target.componentType !== 'Storage' ||
    isWreck(target) ||
    targetId === storage.id ||
    !isAccessible(world, storage.id, targetId, params.proximityRange)
  ) {
    return fail(RESULT_UNREACHABLE);
  }
  if (groupEnergy(world, storage.id) < params.transferEnergy) return fail(RESULT_NO_ENERGY);

  let w = world;
  let moved = 0;
  if (substanceCode === 0) {
    const free = params.energyCapacity - target.energy;
    moved = Math.min(amount, storage.energy, free);
    if (moved > 0) {
      w = replaceObject(w, { ...storage, energy: storage.energy - moved });
      const currentTarget = getComponent(w, targetId) as StorageComponent;
      w = replaceObject(w, { ...currentTarget, energy: currentTarget.energy + moved });
    }
  } else {
    const available = storage.items.get(substanceCode) ?? 0;
    const unitAtoms = Math.max(1, atomsPerUnit(substanceCode));
    const freeAtoms = params.matterCapacity - storedAtoms(target);
    moved = Math.min(amount, available, Math.floor(freeAtoms / unitAtoms));
    if (moved > 0) {
      const selfItems = new Map(storage.items);
      if (available - moved === 0) selfItems.delete(substanceCode);
      else selfItems.set(substanceCode, available - moved);
      w = replaceObject(w, { ...storage, items: selfItems });
      const currentTarget = getComponent(w, targetId) as StorageComponent;
      const targetItems = new Map(currentTarget.items);
      targetItems.set(substanceCode, (targetItems.get(substanceCode) ?? 0) + moved);
      w = replaceObject(w, { ...currentTarget, items: targetItems });
    }
  }

  w = withdrawEnergy(w, storage.id, params.transferEnergy).world;
  w = applyWear(w, storage.id, events);
  return patchOpmem(w, storage.id, [
    [STOR_OFF_TRANSFER_TRIGGER, 0],
    [STOR_OFF_RESULT, moved > 0 ? RESULT_SUCCESS : RESULT_NO_CAPACITY],
  ]);
};

const processStorage = (
  world: World,
  storageId: number,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const storage = getComponent(world, storageId);
  if (storage === undefined || storage.componentType !== 'Storage' || isWreck(storage)) return world;

  let w = world;
  if (storage.opmem[STOR_OFF_TRANSFER_TRIGGER] === 1) {
    w = executeTransfer(w, storage, params, events);
  }
  // 在庫表示・照会の更新（毎tick、トリガ不要）
  const current = getComponent(w, storageId) as StorageComponent;
  const queryCode = current.opmem[STOR_OFF_QUERY_CODE];
  return patchOpmem(w, storageId, [
    [STOR_OFF_STORED_ENERGY, Math.min(0xffff, current.energy)],
    [STOR_OFF_STORED_ATOMS, Math.min(0xffff, storedAtoms(current))],
    [STOR_OFF_QUERY_COUNT, Math.min(0xffff, current.items.get(queryCode) ?? 0)],
  ]);
};

// === Processor CSCAN ===

const processProcessorCscan = (world: World, processorId: number, params: GameParams): World => {
  const processor = getComponent(world, processorId);
  if (processor === undefined || processor.componentType !== 'Processor' || isWreck(processor)) {
    return world;
  }
  if (processor.opmem[PROC_OFF_CSCAN_TRIGGER] !== 1) return world;

  const { world: w1, paid } = withdrawEnergy(world, processorId, params.cscanEnergy);
  if (!paid) {
    return patchOpmem(world, processorId, [
      [PROC_OFF_CSCAN_TRIGGER, 0],
      [PROC_OFF_CSCAN_COUNT, 0],
    ]);
  }

  const filter = processor.opmem[PROC_OFF_CSCAN_FILTER];
  const group = getMemberGroup(w1, processorId);
  const members = (group?.memberIds ?? [])
    .filter(id => id !== processorId)
    .map(id => getComponent(w1, id))
    .filter((c): c is ComponentObject => c !== undefined)
    .filter(c => filter === 0 || typeCodeOf(c) === filter)
    .sort((a, b) => a.id - b.id)
    .slice(0, params.scanMaxResults);

  // CSCANの結果はローカルIDで返す（未知のメンバーはここで採番される）
  const table = new Map(processor.localIdTable);
  let counter = processor.localIdCounter;
  const localIdFor = (objectId: number): number => {
    for (const [lid, oid] of table) {
      if (oid === objectId) return lid;
    }
    const lid = counter;
    counter += 1;
    table.set(lid, objectId);
    return lid;
  };

  const patch: Array<readonly [number, number]> = [
    [PROC_OFF_CSCAN_TRIGGER, 0],
    [PROC_OFF_CSCAN_COUNT, members.length],
  ];
  for (let i = 0; i < params.scanMaxResults; i++) {
    const base = PROC_OFF_CSCAN_RESULTS + i * SCAN_ENTRY_WORDS;
    if (i < members.length) {
      const member = members[i];
      patch.push([base + 0, localIdFor(member.id)]);
      patch.push([base + 1, typeCodeOf(member)]);
      patch.push([base + 2, 0]);
      patch.push([base + 3, scanAux(member, params)]);
    } else {
      patch.push([base + 0, 0], [base + 1, 0], [base + 2, 0], [base + 3, 0]);
    }
  }

  const current = getComponent(w1, processorId) as ProcessorComponent;
  const updated: ProcessorComponent = { ...current, localIdTable: table, localIdCounter: counter };
  return patchOpmem(replaceObject(w1, updated), processorId, patch);
};

// === フェーズ2全体 ===

export const executeActionPhase = (
  world: World,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  let w = processDisconnects(world);
  const ids = allComponents(w)
    .map(c => c.id)
    .sort((a, b) => a - b);
  for (const id of ids) {
    const component = getComponent(w, id);
    if (component === undefined) continue;
    switch (component.componentType) {
      case 'Assembler':
        w = processAssembler(w, id, params, events);
        break;
      case 'Harvester':
        w = processHarvester(w, id, params, events);
        break;
      case 'Disassembler':
        w = processDisassembler(w, id, params, events);
        break;
      case 'Sensor':
        w = processSensor(w, id, params, events);
        break;
      case 'Storage':
        w = processStorage(w, id, params, events);
        break;
      case 'Processor':
        w = processProcessorCscan(w, id, params);
        break;
      case 'MemoryCore':
      case 'Actuator':
        break;
    }
  }
  return w;
};
