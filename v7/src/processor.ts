/**
 * Processor Component — executes VM programs and handles v7 I/O.
 *
 * I/O address space:
 *   0x0000-0x00FF: Self state (position, tick)
 *   0x0100-0x01FF: Self operation memory
 *   0x1000-0x1FFF: External component operation memory access
 *   0x2000-0x2FFF: External Processor program memory access
 */

import type {
  World,
  WorldObject,
  ProcessorObject,
  AssemblerObject,
  Position,
} from './types.js';
import type { GameParams } from './params.js';
import { executeOneTick } from './vm/vm.js';
import type { VmState } from './types.js';
import { distance, findNearbyObjects, replaceObject, getObject } from './world.js';

export const PROCESSOR_OPMEM_SIZE = 37;

// ============================================================
// Create Processor
// ============================================================
export function createProcessor(
  id: string,
  position: Position,
  program: readonly number[],
  running: boolean = false,
): ProcessorObject {
  const memory = new Array(1024).fill(0);
  for (let i = 0; i < program.length && i < 1024; i++) {
    memory[i] = program[i];
  }
  const opMem = new Array(PROCESSOR_OPMEM_SIZE).fill(0);
  if (running) opMem[2] = 1;  // run_flag

  return {
    id,
    kind: 'processor',
    position,
    orientation: 0,
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
  processorId: string,
  params: GameParams,
): { world: World } {
  const proc = world.objects.find(o => o.id === processorId) as ProcessorObject | undefined;
  if (!proc || !proc.running) return { world };

  // Build I/O handler
  const ioState = createIoState(proc, world, params);

  // Convert ProcessorObject to VmState for VM execution
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

  // Apply I/O side effects to world
  let currentWorld = applyIoEffects(ioState, world);

  // Update Processor state
  const updatedProc: ProcessorObject = {
    ...proc,
    memory: execResult.vm.memory as number[],
    registers: execResult.vm.registers as number[],
    pc: execResult.vm.pc,
    // Check if run_flag was changed via operation memory
    running: ioState.selfOpMem[2] !== 0,
    operationMemory: [...ioState.selfOpMem],
    // Persist I/O state across ticks
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
  // Mutable state
  selfOpMem: number[];
  localIdMap: Map<number, string>;    // localId → objectId
  nextLocalId: number;
  // External access state
  opMemTargetId: number;
  opMemOffset: number;
  pmemTargetId: number;
  pmemAddr: number;
  // Pending writes to external objects
  pendingWrites: Map<string, { opMem?: number[]; memory?: Map<number, number> }>;
  // Scan results cached
  scanPerformed: boolean;
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
    scanPerformed: false,
  };
}

// ============================================================
// I/O Read
// ============================================================
function ioRead(state: IoState, addr: number): number {
  // Self state (0x0000-0x00FF)
  if (addr >= 0x0000 && addr <= 0x00FF) {
    switch (addr) {
      case 0x0000: return Math.floor(state.proc.position.x) & 0xFFFF;
      case 0x0001: return Math.floor(state.proc.position.y) & 0xFFFF;
      case 0x0002: return state.world.tick & 0xFFFF;
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
      case 0x1002: return readExternalOpMem(state); // OPMEM_VALUE
      case 0x1003: return readExternalType(state);   // OPMEM_TARGET_TYPE
      case 0x1004: {                                  // OPMEM_AUTO_VALUE
        const val = readExternalOpMem(state);
        state.opMemOffset++;
        return val;
      }
      default: return 0;
    }
  }

  // External Processor memory read (0x2000-0x2FFF)
  if (addr >= 0x2000 && addr <= 0x2FFF) {
    switch (addr) {
      case 0x2002: return readExternalPMem(state);   // PMEM_VALUE
      case 0x2003: {                                   // PMEM_AUTO_VALUE
        const val = readExternalPMem(state);
        state.pmemAddr = (state.pmemAddr + 1) & 0x3FF;  // wrap at 1024
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
      // Check for SCAN trigger
      if (offset === 1 && value === 1) {
        performScan(state);
        return;
      }
      state.selfOpMem[offset] = value;
    }
    return;
  }

  // External operation memory (0x1000-0x1FFF)
  if (addr >= 0x1000 && addr <= 0x1FFF) {
    switch (addr) {
      case 0x1000: state.opMemTargetId = value; break;  // TARGET_ID
      case 0x1001: state.opMemOffset = value; break;     // OFFSET
      case 0x1002: writeExternalOpMem(state, value); break;  // VALUE
      case 0x1004:                                        // AUTO_VALUE
        writeExternalOpMem(state, value);
        state.opMemOffset++;
        break;
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
// SCAN implementation
// ============================================================
function performScan(state: IoState): void {
  const filter = state.selfOpMem[3];  // scan_filter
  const nearby = findNearbyObjects(state.world, state.proc.position, state.params.proximityRange, state.proc.id);

  // Filter by type
  const filtered = nearby.filter(obj => {
    if (filter === 0) return true;
    if (filter === 1) return obj.kind === 'assembler';
    if (filter === 2) return obj.kind === 'processor';
    if (filter === 3) return obj.kind === 'material';
    if (filter === 4) return obj.kind === 'energy';
    return true;
  });

  // Sort by distance
  const sorted = [...filtered]
    .map(obj => ({ obj, dist: distance(state.proc.position, obj.position) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8);  // max 8 results

  // Assign local IDs and write results
  state.selfOpMem[4] = sorted.length;  // scan_count

  for (let i = 0; i < 8; i++) {
    const base = 5 + i * 4;
    if (i < sorted.length) {
      const { obj, dist } = sorted[i];
      const localId = state.nextLocalId++;
      state.localIdMap.set(localId, obj.id);
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

  state.scanPerformed = true;
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
  }
}

function getAux(obj: WorldObject): number {
  switch (obj.kind) {
    case 'assembler': return (obj as AssemblerObject).operationMemory[0]; // current_action
    case 'processor': return (obj as ProcessorObject).running ? 1 : 0;
    case 'material': return getTypeId(obj);
    case 'energy': return obj.amount & 0xFFFF;
  }
}

// ============================================================
// External operation memory access
// ============================================================
function resolveLocalId(state: IoState, localId: number): WorldObject | undefined {
  const objectId = state.localIdMap.get(localId);
  if (!objectId) return undefined;
  const obj = getObject(state.world, objectId);
  if (!obj) return undefined;
  // Check still in proximity
  if (distance(state.proc.position, obj.position) > state.params.proximityRange) return undefined;
  return obj;
}

function readExternalOpMem(state: IoState): number {
  const obj = resolveLocalId(state, state.opMemTargetId);
  if (!obj) return 0;
  if (obj.kind !== 'assembler' && obj.kind !== 'processor') return 0;
  const opMem = (obj as AssemblerObject | ProcessorObject).operationMemory;
  if (state.opMemOffset >= opMem.length) return 0;
  return opMem[state.opMemOffset];
}

function readExternalType(state: IoState): number {
  const obj = resolveLocalId(state, state.opMemTargetId);
  if (!obj) return 0;
  return getTypeId(obj);
}

function writeExternalOpMem(state: IoState, value: number): void {
  const obj = resolveLocalId(state, state.opMemTargetId);
  if (!obj) return;
  if (obj.kind !== 'assembler' && obj.kind !== 'processor') return;

  const pending = state.pendingWrites.get(obj.id) ?? {};
  if (!pending.opMem) {
    pending.opMem = [...(obj as AssemblerObject | ProcessorObject).operationMemory];
  }
  if (state.opMemOffset < pending.opMem.length) {
    pending.opMem[state.opMemOffset] = value;
  }
  state.pendingWrites.set(obj.id, pending);
}

// ============================================================
// External Processor memory access
// ============================================================
function readExternalPMem(state: IoState): number {
  const obj = resolveLocalId(state, state.pmemTargetId);
  if (!obj || obj.kind !== 'processor') return 0;
  const proc = obj as ProcessorObject;
  if (state.pmemAddr >= proc.memory.length) return 0;
  return proc.memory[state.pmemAddr];
}

function writeExternalPMem(state: IoState, value: number): void {
  const obj = resolveLocalId(state, state.pmemTargetId);
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
      let updated: WorldObject;
      if (obj.kind === 'processor') {
        const proc = obj as ProcessorObject;
        const newRunning = writes.opMem[2] !== 0;
        updated = { ...proc, operationMemory: writes.opMem, running: newRunning };
      } else {
        updated = { ...obj, operationMemory: writes.opMem };
      }
      currentWorld = replaceObject(currentWorld, updated);
    }

    if (writes.memory && obj.kind === 'processor') {
      const proc = (getObject(currentWorld, objectId) ?? obj) as ProcessorObject;
      const newMem = [...proc.memory];
      for (const [addr, val] of writes.memory) {
        if (addr >= 0 && addr < newMem.length) newMem[addr] = val;
      }
      currentWorld = replaceObject(currentWorld, { ...proc, memory: newMem });
    }
  }

  return currentWorld;
}
