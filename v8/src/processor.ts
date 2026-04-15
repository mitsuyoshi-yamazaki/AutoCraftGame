/**
 * Processor Component (v8) — executes VM programs and handles v8 I/O.
 *
 * I/O address space:
 *   0x0000-0x00FF: Self state (SELF_POS_X/Y, SELF_TICK, SELF_GROUP_ID)
 *   0x0100-0x01FF: Self operation memory
 *   0x1000-0x1FFF: External component operation memory access
 *                  0x1005 = localId-converted value access (R/W)
 *   0x2000-0x2FFF: External Processor program memory access
 */

import type {
  World,
  WorldObject,
  ProcessorObject,
  AssemblerObject,
  ComponentObject,
  Position,
} from './types.js';
import {
  PROCESSOR_OPMEM_SIZE,
  PROC_OFF_RUN_FLAG,
  PROC_OFF_SCAN_TRIGGER,
  PROC_OFF_SCAN_FILTER,
  PROC_OFF_SCAN_COUNT,
  PROC_OFF_SCAN_RESULTS,
  PROC_OFF_CSCAN_TRIGGER,
  PROC_OFF_CSCAN_FILTER,
  PROC_OFF_CSCAN_COUNT,
  PROC_OFF_CSCAN_RESULTS,
  PROC_OFF_DISCONNECT_TRIGGER,
  PROC_OFF_DISCONNECT_TARGET_ID,
  SCAN_MAX_RESULTS,
  SCAN_ENTRY_WORDS,
  ASSEMBLER_OPMEM_SIZE,
} from './types.js';
import type { GameParams } from './params.js';
import { executeOneTick } from './vm/vm.js';
import type { VmState } from './types.js';
import {
  distance,
  findNearbyObjects,
  replaceObject,
  getObject,
  effectivePosition,
  getMemberGroup,
  isAccessible,
  inSameGroup,
} from './world.js';

export { PROCESSOR_OPMEM_SIZE };

// ============================================================
// Create Processor
// ============================================================
export function createProcessor(
  id: number,
  position: Position,
  program: readonly number[],
  running: boolean = false,
): ProcessorObject {
  const memory = new Array(1024).fill(0);
  for (let i = 0; i < program.length && i < 1024; i++) {
    memory[i] = program[i];
  }
  const opMem = new Array(PROCESSOR_OPMEM_SIZE).fill(0);
  if (running) opMem[PROC_OFF_RUN_FLAG] = 1;

  return {
    id,
    kind: 'processor',
    position,
    orientation: 0,
    groupId: null,
    operationMemory: opMem,
    running,
    memory,
    registers: [0, 0, 0, 0, 0, 0, 0, 0],
    pc: 0,
    localIdTable: new Map(),
    localIdCounter: 1,
    ioRegisters: { opMemTargetId: 0, opMemOffset: 0, pmemTargetId: 0, pmemAddr: 0 },
  };
}

// ============================================================
// Execute one tick
// ============================================================
export function executeProcessorTick(
  world: World,
  processorId: number,
  params: GameParams,
): { world: World } {
  const proc = getObject(world, processorId) as ProcessorObject | undefined;
  if (!proc || proc.kind !== 'processor' || !proc.running) return { world };

  const ioState = createIoState(proc, world, params);

  const vmState: VmState = {
    memory: [...proc.memory],
    registers: [...proc.registers],
    pc: proc.pc,
    cp: 0,
    cpSet: false,
    active: true,
    localIdTable: new Map(),
    localIdCounter: 0,
  };

  const execResult = executeOneTick(
    vmState,
    (addr) => ioRead(ioState, addr),
    (addr, value) => ioWrite(ioState, addr, value),
    params.instructionsPerTick,
  );

  let currentWorld = applyIoEffects(ioState, world);

  const updatedProc: ProcessorObject = {
    ...proc,
    memory: execResult.vm.memory as number[],
    registers: execResult.vm.registers as number[],
    pc: execResult.vm.pc,
    running: ioState.selfOpMem[PROC_OFF_RUN_FLAG] !== 0,
    operationMemory: [...ioState.selfOpMem],
    localIdTable: new Map(ioState.localIdMap),
    localIdCounter: ioState.nextLocalId,
    ioRegisters: {
      opMemTargetId: ioState.opMemTargetId,
      opMemOffset: ioState.opMemOffset,
      pmemTargetId: ioState.pmemTargetId,
      pmemAddr: ioState.pmemAddr,
    },
  };

  currentWorld = replaceObject(currentWorld, updatedProc);
  return { world: currentWorld };
}

// ============================================================
// I/O State (mutable during VM execution)
// ============================================================
interface IoState {
  readonly proc: ProcessorObject;
  readonly world: World;
  readonly params: GameParams;
  selfOpMem: number[];
  localIdMap: Map<number, number>;  // localId → canonical objectId
  nextLocalId: number;
  opMemTargetId: number;
  opMemOffset: number;
  pmemTargetId: number;
  pmemAddr: number;
  pendingWrites: Map<number, {
    opMem?: number[];
    memory?: Map<number, number>;
    // local table updates to apply back to the *target* processor for 0x1005 writes
    targetLocalIdEntries?: Array<{ localId: number; objectId: number }>;
    targetNextLocalId?: number;
  }>;
}

function createIoState(proc: ProcessorObject, world: World, params: GameParams): IoState {
  return {
    proc,
    world,
    params,
    selfOpMem: [...proc.operationMemory],
    localIdMap: new Map(proc.localIdTable),
    nextLocalId: proc.localIdCounter,
    opMemTargetId: proc.ioRegisters.opMemTargetId,
    opMemOffset: proc.ioRegisters.opMemOffset,
    pmemTargetId: proc.ioRegisters.pmemTargetId,
    pmemAddr: proc.ioRegisters.pmemAddr,
    pendingWrites: new Map(),
  };
}

// ============================================================
// I/O Read
// ============================================================
function ioRead(state: IoState, addr: number): number {
  // Self state (0x0000-0x00FF)
  if (addr >= 0x0000 && addr <= 0x00FF) {
    const pos = effectivePosition(state.world, state.proc);
    switch (addr) {
      case 0x0000: return Math.floor(pos.x) & 0xFFFF;
      case 0x0001: return Math.floor(pos.y) & 0xFFFF;
      case 0x0002: return state.world.tick & 0xFFFF;
      case 0x0003: return state.proc.groupId ?? 0;
      default: return 0;
    }
  }

  // Self operation memory (0x0100-0x01FF)
  if (addr >= 0x0100 && addr <= 0x01FF) {
    const offset = addr - 0x0100;
    if (offset < state.selfOpMem.length) return state.selfOpMem[offset];
    return 0;
  }

  // External operation memory read (0x1000-0x1FFF)
  if (addr >= 0x1000 && addr <= 0x1FFF) {
    switch (addr) {
      case 0x1002: return readExternalOpMem(state);
      case 0x1003: return readExternalType(state);
      case 0x1004: {
        const val = readExternalOpMem(state);
        state.opMemOffset++;
        return val;
      }
      case 0x1005: return readExternalOpMemLocalId(state);
      default: return 0;
    }
  }

  // External Processor memory read (0x2000-0x2FFF)
  if (addr >= 0x2000 && addr <= 0x2FFF) {
    switch (addr) {
      case 0x2002: return readExternalPMem(state);
      case 0x2003: {
        const val = readExternalPMem(state);
        state.pmemAddr = (state.pmemAddr + 1) & 0x3FF;
        return val;
      }
      default: return 0;
    }
  }

  return 0;
}

// ============================================================
// I/O Write
// ============================================================
function ioWrite(state: IoState, addr: number, value: number): void {
  value = value & 0xFFFF;

  // Self operation memory (0x0100-0x01FF)
  if (addr >= 0x0100 && addr <= 0x01FF) {
    const offset = addr - 0x0100;
    if (offset < state.selfOpMem.length) {
      // SCAN trigger
      if (offset === PROC_OFF_SCAN_TRIGGER && value === 1) {
        performScan(state);
        state.selfOpMem[PROC_OFF_SCAN_TRIGGER] = 0;
        return;
      }
      // CONNECTION_SCAN trigger
      if (offset === PROC_OFF_CSCAN_TRIGGER && value === 1) {
        performConnectionScan(state);
        state.selfOpMem[PROC_OFF_CSCAN_TRIGGER] = 0;
        return;
      }
      state.selfOpMem[offset] = value;
    }
    return;
  }

  // External operation memory (0x1000-0x1FFF)
  if (addr >= 0x1000 && addr <= 0x1FFF) {
    switch (addr) {
      case 0x1000: state.opMemTargetId = value; break;
      case 0x1001: state.opMemOffset = value; break;
      case 0x1002: writeExternalOpMem(state, value); break;
      case 0x1004:
        writeExternalOpMem(state, value);
        state.opMemOffset++;
        break;
      case 0x1005: writeExternalOpMemLocalId(state, value); break;
    }
    return;
  }

  // External Processor memory (0x2000-0x2FFF)
  if (addr >= 0x2000 && addr <= 0x2FFF) {
    switch (addr) {
      case 0x2000: state.pmemTargetId = value; break;
      case 0x2001: state.pmemAddr = value & 0x3FF; break;
      case 0x2002: writeExternalPMem(state, value); break;
      case 0x2003:
        writeExternalPMem(state, value);
        state.pmemAddr = (state.pmemAddr + 1) & 0x3FF;
        break;
    }
    return;
  }
}

// ============================================================
// Local ID helpers
// ============================================================
/** Ensures the given objectId has a localId in the proc's table; returns it. */
function ensureLocalIdForSelf(state: IoState, objectId: number): number {
  for (const [lid, oid] of state.localIdMap) {
    if (oid === objectId) return lid;
  }
  const lid = state.nextLocalId++;
  state.localIdMap.set(lid, objectId);
  return lid;
}

function resolveSelfLocalId(state: IoState, localId: number): number | undefined {
  return state.localIdMap.get(localId);
}

// ============================================================
// SCAN implementation (non-connected, nearby)
// ============================================================
function performScan(state: IoState): void {
  const filter = state.selfOpMem[PROC_OFF_SCAN_FILTER];
  const selfPos = effectivePosition(state.world, state.proc);
  const nearby = findNearbyObjects(state.world, selfPos, state.params.proximityRange, state.proc.id);

  const filtered = nearby.filter(obj => {
    // Exclude members of the same group (they go through CONNECTION_SCAN)
    if (state.proc.groupId !== null && (obj.kind === 'assembler' || obj.kind === 'processor')) {
      if (obj.groupId === state.proc.groupId) return false;
    }
    if (filter === 0) return true;
    if (filter === 1) return obj.kind === 'assembler';
    if (filter === 2) return obj.kind === 'processor';
    if (filter === 3) return obj.kind === 'material';
    if (filter === 4) return obj.kind === 'energy';
    return true;
  });

  const sorted = [...filtered]
    .map(obj => ({ obj, dist: distance(selfPos, effectivePosition(state.world, obj)) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, SCAN_MAX_RESULTS);

  state.selfOpMem[PROC_OFF_SCAN_COUNT] = sorted.length;

  for (let i = 0; i < SCAN_MAX_RESULTS; i++) {
    const base = PROC_OFF_SCAN_RESULTS + i * SCAN_ENTRY_WORDS;
    if (i < sorted.length) {
      const { obj, dist } = sorted[i];
      const localId = ensureLocalIdForSelf(state, obj.id);
      state.selfOpMem[base + 0] = localId;
      state.selfOpMem[base + 1] = getTypeId(obj);
      state.selfOpMem[base + 2] = Math.floor(dist);
      state.selfOpMem[base + 3] = getAux(obj);
    } else {
      state.selfOpMem[base + 0] = 0;
      state.selfOpMem[base + 1] = 0;
      state.selfOpMem[base + 2] = 0;
      state.selfOpMem[base + 3] = 0;
    }
  }
}

// ============================================================
// CONNECTION_SCAN implementation (same-group members)
// ============================================================
function performConnectionScan(state: IoState): void {
  const filter = state.selfOpMem[PROC_OFF_CSCAN_FILTER];
  const group = getMemberGroup(state.world, state.proc.id);

  const results: WorldObject[] = [];
  if (group) {
    for (const memberId of group.memberIds) {
      if (memberId === state.proc.id) continue;
      const m = getObject(state.world, memberId);
      if (!m) continue;
      if (filter === 0) { results.push(m); continue; }
      if (filter === 1 && m.kind === 'assembler') results.push(m);
      else if (filter === 2 && m.kind === 'processor') results.push(m);
    }
  }

  results.sort((a, b) => a.id - b.id);
  const limited = results.slice(0, SCAN_MAX_RESULTS);

  state.selfOpMem[PROC_OFF_CSCAN_COUNT] = limited.length;

  for (let i = 0; i < SCAN_MAX_RESULTS; i++) {
    const base = PROC_OFF_CSCAN_RESULTS + i * SCAN_ENTRY_WORDS;
    if (i < limited.length) {
      const obj = limited[i];
      const localId = ensureLocalIdForSelf(state, obj.id);
      state.selfOpMem[base + 0] = localId;
      state.selfOpMem[base + 1] = getTypeId(obj);
      state.selfOpMem[base + 2] = 0;
      state.selfOpMem[base + 3] = getAux(obj);
    } else {
      state.selfOpMem[base + 0] = 0;
      state.selfOpMem[base + 1] = 0;
      state.selfOpMem[base + 2] = 0;
      state.selfOpMem[base + 3] = 0;
    }
  }
}

function getTypeId(obj: WorldObject): number {
  switch (obj.kind) {
    case 'assembler': return 1;
    case 'processor': return 2;
    case 'material':
      switch (obj.materialType) {
        case 'Ore': return 10;
        case 'Crystal': return 11;
        case 'Metal': return 12;
        case 'Circuit': return 13;
      }
      return 0;
    case 'energy': return 20;
    case 'group': return 30;
  }
}

function getAux(obj: WorldObject): number {
  switch (obj.kind) {
    case 'assembler': return (obj as AssemblerObject).operationMemory[3]; // assemble_status
    case 'processor': return (obj as ProcessorObject).running ? 1 : 0;
    case 'material': return getTypeId(obj);
    case 'energy': return obj.amount & 0xFFFF;
    case 'group': return 0;
  }
}

// ============================================================
// External operation memory access
// ============================================================
function resolveAccessibleTarget(state: IoState, localId: number): ComponentObject | undefined {
  const objectId = resolveSelfLocalId(state, localId);
  if (objectId === undefined) return undefined;
  const obj = getObject(state.world, objectId);
  if (!obj) return undefined;
  if (obj.kind !== 'assembler' && obj.kind !== 'processor') return undefined;
  if (!isAccessible(state.world, state.proc.id, objectId, state.params.proximityRange)) return undefined;
  return obj;
}

function readExternalOpMem(state: IoState): number {
  const obj = resolveAccessibleTarget(state, state.opMemTargetId);
  if (!obj) return 0;
  const opMem = obj.operationMemory;
  if (state.opMemOffset >= opMem.length) return 0;
  return opMem[state.opMemOffset];
}

function readExternalType(state: IoState): number {
  const obj = resolveAccessibleTarget(state, state.opMemTargetId);
  if (!obj) return 0;
  return getTypeId(obj);
}

function writeExternalOpMem(state: IoState, value: number): void {
  const obj = resolveAccessibleTarget(state, state.opMemTargetId);
  if (!obj) return;
  const pending = state.pendingWrites.get(obj.id) ?? {};
  if (!pending.opMem) pending.opMem = [...obj.operationMemory];
  if (state.opMemOffset < pending.opMem.length) {
    pending.opMem[state.opMemOffset] = value;
  }
  state.pendingWrites.set(obj.id, pending);
}

// ============================================================
// 0x1005 OPMEM_VALUE_LOCAL_ID — conversion I/O
// ============================================================
function readExternalOpMemLocalId(state: IoState): number {
  const obj = resolveAccessibleTarget(state, state.opMemTargetId);
  if (!obj) return 0;
  const slotValue = obj.operationMemory[state.opMemOffset] ?? 0;
  if (slotValue === 0) return 0;

  // Resolve slotValue to canonical objectId depending on target kind
  let canonicalId: number | undefined;
  if (obj.kind === 'processor') {
    canonicalId = obj.localIdTable.get(slotValue);
  } else if (obj.kind === 'assembler') {
    canonicalId = slotValue;  // assembler stores raw objectId
  }
  if (canonicalId === undefined) return 0;

  // Ensure readerside has a localId for this canonicalId
  return ensureLocalIdForSelf(state, canonicalId);
}

function writeExternalOpMemLocalId(state: IoState, value: number): void {
  const obj = resolveAccessibleTarget(state, state.opMemTargetId);
  if (!obj) return;
  // Convert writer's localId → canonical objectId
  const canonicalId = resolveSelfLocalId(state, value);
  if (canonicalId === undefined) return;  // silent drop

  const pending = state.pendingWrites.get(obj.id) ?? {};
  if (!pending.opMem) pending.opMem = [...obj.operationMemory];
  // Register the pending object BEFORE calling ensureLocalIdInTargetProcessor so
  // that any mutations there land on the same reference.
  state.pendingWrites.set(obj.id, pending);

  let storedValue: number;
  if (obj.kind === 'processor') {
    const targetLid = ensureLocalIdInTargetProcessor(state, obj, canonicalId);
    storedValue = targetLid;
  } else {
    storedValue = canonicalId & 0xFFFF;
  }
  if (state.opMemOffset < pending.opMem.length) {
    pending.opMem[state.opMemOffset] = storedValue;
  }
}

/**
 * Ensures the target processor has a localId for `canonicalId`. Tracks
 * pending updates to apply back when we commit pendingWrites.
 */
function ensureLocalIdInTargetProcessor(
  state: IoState,
  target: ProcessorObject,
  canonicalId: number,
): number {
  // Consult existing target table
  for (const [lid, oid] of target.localIdTable) {
    if (oid === canonicalId) return lid;
  }
  // Consult pending new entries
  const pending = state.pendingWrites.get(target.id) ?? {};
  const existing = pending.targetLocalIdEntries ?? [];
  for (const e of existing) if (e.objectId === canonicalId) return e.localId;

  const nextLid = (pending.targetNextLocalId ?? target.localIdCounter);
  const newEntry = { localId: nextLid, objectId: canonicalId };
  pending.targetLocalIdEntries = [...existing, newEntry];
  pending.targetNextLocalId = nextLid + 1;
  state.pendingWrites.set(target.id, pending);
  return nextLid;
}

// ============================================================
// External Processor memory access
// ============================================================
function readExternalPMem(state: IoState): number {
  const obj = resolveAccessibleTarget(state, state.pmemTargetId);
  if (!obj || obj.kind !== 'processor') return 0;
  const proc = obj as ProcessorObject;
  if (state.pmemAddr >= proc.memory.length) return 0;
  return proc.memory[state.pmemAddr];
}

function writeExternalPMem(state: IoState, value: number): void {
  const obj = resolveAccessibleTarget(state, state.pmemTargetId);
  if (!obj || obj.kind !== 'processor') return;

  const pending = state.pendingWrites.get(obj.id) ?? {};
  if (!pending.memory) pending.memory = new Map();
  pending.memory.set(state.pmemAddr, value);
  state.pendingWrites.set(obj.id, pending);
}

// ============================================================
// Apply pending I/O effects to world
// ============================================================
function applyIoEffects(state: IoState, world: World): World {
  let currentWorld = world;

  for (const [objectId, writes] of state.pendingWrites) {
    const obj = getObject(currentWorld, objectId);
    if (!obj) continue;

    if (writes.opMem && (obj.kind === 'assembler' || obj.kind === 'processor')) {
      if (obj.kind === 'processor') {
        const proc = obj;
        const newRunning = writes.opMem[PROC_OFF_RUN_FLAG] !== 0;
        const updated: ProcessorObject = { ...proc, operationMemory: writes.opMem, running: newRunning };
        currentWorld = replaceObject(currentWorld, updated);
      } else {
        const updated: AssemblerObject = { ...obj, operationMemory: writes.opMem };
        currentWorld = replaceObject(currentWorld, updated);
      }
    }

    if (writes.memory && obj.kind === 'processor') {
      const proc = (getObject(currentWorld, objectId) ?? obj) as ProcessorObject;
      const newMem = [...proc.memory];
      for (const [addr, val] of writes.memory) {
        if (addr >= 0 && addr < newMem.length) newMem[addr] = val;
      }
      currentWorld = replaceObject(currentWorld, { ...proc, memory: newMem });
    }

    // Apply new target-side localId entries (from 0x1005 writes)
    if (writes.targetLocalIdEntries && writes.targetLocalIdEntries.length > 0) {
      const target = getObject(currentWorld, objectId);
      if (target && target.kind === 'processor') {
        const proc = target as ProcessorObject;
        const newTable = new Map(proc.localIdTable);
        for (const e of writes.targetLocalIdEntries) newTable.set(e.localId, e.objectId);
        const newCounter = writes.targetNextLocalId ?? proc.localIdCounter;
        currentWorld = replaceObject(currentWorld, {
          ...proc,
          localIdTable: newTable,
          localIdCounter: newCounter,
        });
      }
    }
  }

  return currentWorld;
}
