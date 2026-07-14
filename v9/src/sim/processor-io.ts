/**
 * Processor実行フェーズ（フェーズ1） — VM実行とI/O。
 * v8のI/O体系の互換拡張。仕様: docs/specs/03_program_io.md
 *
 * v9の拡張:
 * - 0x0004 GROUP_ENERGY / 0x0005 SELF_DURABILITY
 * - 外部opmem対象は8種すべてのコンポーネント
 * - 外部pmem対象は Processor + MemoryCore
 * - 実行に PROC_TICK_COST が必要（支払えないtickはスキップ）
 * - v8にあったSCANの即時実行はない（SensorのSCAN/自身のCSCANはアクションフェーズ処理）
 */

import type { GameParams } from '../params';
import { executeOneTick } from '../vm/vm';
import type { VmState } from '../vm/vm';
import { typeCodeOf } from './codes';
import { PROC_OFF_RUN_FLAG } from './opmem';
import { groupEnergy, withdrawEnergy } from './storage';
import type {
  ComponentObject,
  MemoryCoreComponent,
  ProcessorComponent,
  SimulationEvent,
  World,
} from './types';
import { isWreck } from './types';
import {
  allComponents,
  effectivePosition,
  getComponent,
  isAccessible,
  replaceObject,
} from './world';

interface PendingWrites {
  opmem?: number[];
  memory?: Map<number, number>;
  targetLocalIdEntries?: Array<{ localId: number; objectId: number }>;
  targetNextLocalId?: number;
}

interface IoState {
  readonly proc: ProcessorComponent;
  readonly world: World;
  readonly params: GameParams;
  selfOpMem: number[];
  localIdMap: Map<number, number>;
  nextLocalId: number;
  opMemTargetId: number;
  opMemOffset: number;
  pmemTargetId: number;
  pmemAddr: number;
  pendingWrites: Map<number, PendingWrites>;
}

const createIoState = (proc: ProcessorComponent, world: World, params: GameParams): IoState => ({
  proc,
  world,
  params,
  selfOpMem: [...proc.opmem],
  localIdMap: new Map(proc.localIdTable),
  nextLocalId: proc.localIdCounter,
  opMemTargetId: proc.ioRegisters.opMemTargetId,
  opMemOffset: proc.ioRegisters.opMemOffset,
  pmemTargetId: proc.ioRegisters.pmemTargetId,
  pmemAddr: proc.ioRegisters.pmemAddr,
  pendingWrites: new Map(),
});

// === ローカルID ===

const ensureLocalIdForSelf = (state: IoState, objectId: number): number => {
  for (const [lid, oid] of state.localIdMap) {
    if (oid === objectId) return lid;
  }
  const lid = state.nextLocalId;
  state.nextLocalId += 1;
  state.localIdMap.set(lid, objectId);
  return lid;
};

// === 対象解決 ===

const resolveAccessibleTarget = (state: IoState, localId: number): ComponentObject | undefined => {
  const objectId = state.localIdMap.get(localId);
  if (objectId === undefined) return undefined;
  const obj = getComponent(state.world, objectId);
  if (obj === undefined) return undefined;
  if (!isAccessible(state.world, state.proc.id, objectId, state.params.proximityRange)) return undefined;
  return obj;
};

// === 外部opmem ===

const readExternalOpMem = (state: IoState): number => {
  const target = resolveAccessibleTarget(state, state.opMemTargetId);
  if (target === undefined) return 0;
  const pendingOpmem = state.pendingWrites.get(target.id)?.opmem;
  const opmem = pendingOpmem ?? target.opmem;
  return state.opMemOffset < opmem.length ? opmem[state.opMemOffset] : 0;
};

const writeExternalOpMem = (state: IoState, value: number): void => {
  const target = resolveAccessibleTarget(state, state.opMemTargetId);
  if (target === undefined) return;
  const pending = state.pendingWrites.get(target.id) ?? {};
  if (pending.opmem === undefined) pending.opmem = [...target.opmem];
  if (state.opMemOffset < pending.opmem.length) {
    pending.opmem[state.opMemOffset] = value;
  }
  state.pendingWrites.set(target.id, pending);
};

/** 0x1005: ローカルID変換付きアクセス。Processor対象は相手テーブルで変換、他は生ID */
const readExternalOpMemLocalId = (state: IoState): number => {
  const target = resolveAccessibleTarget(state, state.opMemTargetId);
  if (target === undefined) return 0;
  const slotValue = target.opmem[state.opMemOffset] ?? 0;
  if (slotValue === 0) return 0;
  const canonicalId =
    target.componentType === 'Processor'
      ? (target as ProcessorComponent).localIdTable.get(slotValue)
      : slotValue;
  if (canonicalId === undefined) return 0;
  return ensureLocalIdForSelf(state, canonicalId);
};

const ensureLocalIdInTargetProcessor = (
  state: IoState,
  target: ProcessorComponent,
  canonicalId: number,
): number => {
  for (const [lid, oid] of target.localIdTable) {
    if (oid === canonicalId) return lid;
  }
  const pending = state.pendingWrites.get(target.id) ?? {};
  const existing = pending.targetLocalIdEntries ?? [];
  for (const entry of existing) {
    if (entry.objectId === canonicalId) return entry.localId;
  }
  const nextLid = pending.targetNextLocalId ?? target.localIdCounter;
  pending.targetLocalIdEntries = [...existing, { localId: nextLid, objectId: canonicalId }];
  pending.targetNextLocalId = nextLid + 1;
  state.pendingWrites.set(target.id, pending);
  return nextLid;
};

const writeExternalOpMemLocalId = (state: IoState, value: number): void => {
  const target = resolveAccessibleTarget(state, state.opMemTargetId);
  if (target === undefined) return;
  const canonicalId = state.localIdMap.get(value);
  if (canonicalId === undefined) return; // silent drop

  const pending = state.pendingWrites.get(target.id) ?? {};
  if (pending.opmem === undefined) pending.opmem = [...target.opmem];
  state.pendingWrites.set(target.id, pending);

  const storedValue =
    target.componentType === 'Processor'
      ? ensureLocalIdInTargetProcessor(state, target as ProcessorComponent, canonicalId)
      : canonicalId & 0xffff;
  if (state.opMemOffset < pending.opmem.length) {
    pending.opmem[state.opMemOffset] = storedValue;
  }
};

// === 外部pmem（Processor / MemoryCore） ===

const pmemTargetOf = (
  state: IoState,
): ProcessorComponent | MemoryCoreComponent | undefined => {
  const target = resolveAccessibleTarget(state, state.pmemTargetId);
  if (target === undefined) return undefined;
  if (target.componentType === 'Processor' || target.componentType === 'MemoryCore') return target;
  return undefined;
};

const readExternalPMem = (state: IoState): number => {
  const target = pmemTargetOf(state);
  if (target === undefined) return 0;
  const pendingMem = state.pendingWrites.get(target.id)?.memory;
  const addr = state.pmemAddr % target.memory.length;
  const pendingValue = pendingMem?.get(addr);
  return pendingValue ?? target.memory[addr];
};

const writeExternalPMem = (state: IoState, value: number): void => {
  const target = pmemTargetOf(state);
  if (target === undefined) return;
  const pending = state.pendingWrites.get(target.id) ?? {};
  if (pending.memory === undefined) pending.memory = new Map();
  pending.memory.set(state.pmemAddr % target.memory.length, value);
  state.pendingWrites.set(target.id, pending);
};

// === I/O ハンドラ ===

const ioRead = (state: IoState, addr: number): number => {
  if (addr >= 0x0000 && addr <= 0x00ff) {
    const pos = effectivePosition(state.world, state.proc);
    switch (addr) {
      case 0x0000:
        return Math.floor(pos.x) & 0xffff;
      case 0x0001:
        return Math.floor(pos.y) & 0xffff;
      case 0x0002:
        return state.world.tick & 0xffff;
      case 0x0003:
        return state.proc.groupId ?? 0;
      case 0x0004:
        return Math.min(0xffff, groupEnergy(state.world, state.proc.id));
      case 0x0005:
        return Math.max(0, state.proc.durability) & 0xffff;
      case 0x0006:
        return state.proc.id & 0xffff; // SELF_OBJECT_ID（自己修復・自己参照に必要）
      default:
        return 0;
    }
  }
  if (addr >= 0x0100 && addr <= 0x01ff) {
    const offset = addr - 0x0100;
    return offset < state.selfOpMem.length ? state.selfOpMem[offset] : 0;
  }
  if (addr >= 0x1000 && addr <= 0x1fff) {
    switch (addr) {
      case 0x1002:
        return readExternalOpMem(state);
      case 0x1003: {
        const target = resolveAccessibleTarget(state, state.opMemTargetId);
        return target === undefined ? 0 : typeCodeOf(target);
      }
      case 0x1004: {
        const value = readExternalOpMem(state);
        state.opMemOffset += 1;
        return value;
      }
      case 0x1005:
        return readExternalOpMemLocalId(state);
      default:
        return 0;
    }
  }
  if (addr >= 0x2000 && addr <= 0x2fff) {
    switch (addr) {
      case 0x2002:
        return readExternalPMem(state);
      case 0x2003: {
        const value = readExternalPMem(state);
        state.pmemAddr = (state.pmemAddr + 1) & (state.params.pmemWords - 1);
        return value;
      }
      default:
        return 0;
    }
  }
  return 0;
};

const ioWrite = (state: IoState, addr: number, rawValue: number): void => {
  const value = rawValue & 0xffff;
  if (addr >= 0x0100 && addr <= 0x01ff) {
    const offset = addr - 0x0100;
    if (offset < state.selfOpMem.length) {
      state.selfOpMem[offset] = value;
    }
    return;
  }
  if (addr >= 0x1000 && addr <= 0x1fff) {
    switch (addr) {
      case 0x1000:
        state.opMemTargetId = value;
        break;
      case 0x1001:
        state.opMemOffset = value;
        break;
      case 0x1002:
        writeExternalOpMem(state, value);
        break;
      case 0x1004:
        // 対象不到達で書込がドロップされてもオフセットは進む（意図された変異面）
        writeExternalOpMem(state, value);
        state.opMemOffset += 1;
        break;
      case 0x1005:
        writeExternalOpMemLocalId(state, value);
        break;
      default:
        break;
    }
    return;
  }
  if (addr >= 0x2000 && addr <= 0x2fff) {
    switch (addr) {
      case 0x2000:
        state.pmemTargetId = value;
        break;
      case 0x2001:
        state.pmemAddr = value & (state.params.pmemWords - 1);
        break;
      case 0x2002:
        writeExternalPMem(state, value);
        break;
      case 0x2003:
        writeExternalPMem(state, value);
        state.pmemAddr = (state.pmemAddr + 1) & (state.params.pmemWords - 1);
        break;
      default:
        break;
    }
    return;
  }
};

// === pendingWritesの反映（フェーズ1のProcessorごと、実行直後に一括） ===

const applyIoEffects = (state: IoState, world: World, events: SimulationEvent[]): World => {
  let w = world;
  for (const [objectId, writes] of state.pendingWrites) {
    const target = getComponent(w, objectId);
    if (target === undefined) continue;

    if (writes.opmem !== undefined) {
      let updated: ComponentObject = { ...target, opmem: writes.opmem };
      if (updated.componentType === 'Processor') {
        const newRunning = writes.opmem[PROC_OFF_RUN_FLAG] !== 0;
        const wasRunning = (target as ProcessorComponent).running;
        updated = { ...(updated as ProcessorComponent), running: newRunning };
        if (newRunning && !wasRunning) {
          events.push({ type: 'processor_started', id: objectId });
        }
      }
      w = replaceObject(w, updated);
    }

    if (writes.memory !== undefined) {
      const current = getComponent(w, objectId);
      if (current !== undefined && (current.componentType === 'Processor' || current.componentType === 'MemoryCore')) {
        const memory = [...(current as ProcessorComponent | MemoryCoreComponent).memory];
        for (const [addr, value] of writes.memory) {
          if (addr >= 0 && addr < memory.length) memory[addr] = value;
        }
        w = replaceObject(w, { ...(current as ProcessorComponent | MemoryCoreComponent), memory });
      }
    }

    if (writes.targetLocalIdEntries !== undefined && writes.targetLocalIdEntries.length > 0) {
      const current = getComponent(w, objectId);
      if (current !== undefined && current.componentType === 'Processor') {
        const proc = current as ProcessorComponent;
        const table = new Map(proc.localIdTable);
        for (const entry of writes.targetLocalIdEntries) table.set(entry.localId, entry.objectId);
        w = replaceObject(w, {
          ...proc,
          localIdTable: table,
          localIdCounter: writes.targetNextLocalId ?? proc.localIdCounter,
        });
      }
    }
  }
  return w;
};

// === フェーズ1: 全Processorの実行 ===

const executeProcessor = (
  world: World,
  processorId: number,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const proc = getComponent(world, processorId);
  if (proc === undefined || proc.componentType !== 'Processor') return world;
  if (!proc.running || isWreck(proc)) return world;

  // 実行コスト。支払えないtickは実行されない（飢餓）
  const { world: paidWorld, paid } = withdrawEnergy(world, processorId, params.procTickCost);
  if (!paid) return world;

  const state = createIoState(proc, paidWorld, params);
  const vmState: VmState = {
    memory: [...proc.memory],
    registers: [...proc.registers],
    pc: proc.pc,
    cp: 0,
    cpSet: false,
  };

  const result = executeOneTick(
    vmState,
    addr => ioRead(state, addr),
    (addr, value) => ioWrite(state, addr, value),
    params.instructionsPerTick,
  );

  let w = applyIoEffects(state, paidWorld, events);

  const current = getComponent(w, processorId) as ProcessorComponent | undefined;
  if (current === undefined) return w;
  const updated: ProcessorComponent = {
    ...current,
    memory: result.vm.memory,
    registers: result.vm.registers,
    pc: result.vm.pc,
    running: state.selfOpMem[PROC_OFF_RUN_FLAG] !== 0,
    opmem: [...state.selfOpMem],
    localIdTable: new Map(state.localIdMap),
    localIdCounter: state.nextLocalId,
    ioRegisters: {
      opMemTargetId: state.opMemTargetId,
      opMemOffset: state.opMemOffset,
      pmemTargetId: state.pmemTargetId,
      pmemAddr: state.pmemAddr,
    },
  };
  return replaceObject(w, updated);
};

/** 実行したProcessorのID集合も返す（継続摩耗の判定に使う） */
export const executeProcessorPhase = (
  world: World,
  params: GameParams,
  events: SimulationEvent[],
): { world: World; executedIds: ReadonlySet<number> } => {
  const executedIds = new Set<number>();
  let w = world;
  const processorIds = allComponents(w)
    .filter(c => c.componentType === 'Processor')
    .filter(c => (c as ProcessorComponent).running && !isWreck(c))
    .map(c => c.id)
    .sort((a, b) => a - b);
  for (const id of processorIds) {
    const before = w;
    w = executeProcessor(w, id, params, events);
    if (w !== before) executedIds.add(id);
  }
  return { world: w, executedIds };
};
