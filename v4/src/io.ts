/**
 * I/O Space Handler — maps I/O addresses to game state reads/writes.
 *
 * When the VM executes IN/OUT instructions, the callbacks created here
 * resolve reads (character status, sensor results, query results) and
 * writes (action reservations via command-last protocol).
 */

import type {
  Character,
  ComponentType,
  World,
  Position,
} from './types.js';
import type { GameParams } from './params.js';
import { isActive } from './character.js';
import { distance } from './world.js';
import type { SpatialGrid } from './spatial-grid.js';
import { queryRange } from './spatial-grid.js';

// ============================================================
// I/O address constants
// ============================================================
const IO_ENERGY     = 0x0000;
const IO_DURABILITY = 0x0001;
const IO_POS_X      = 0x0002;
const IO_POS_Y      = 0x0003;
const IO_VEL_X      = 0x0004;
const IO_VEL_Y      = 0x0005;
const IO_TICK       = 0x0006;

const COMP_DISC_BASE = 0x0010;

const INVENTORY_BASE   = 0x0020;
const INVENTORY_TYPE   = 0x0020;
const INVENTORY_CMD    = 0x0021;
const INVENTORY_RESULT = 0x0022;

const BASE_ACTUATOR      = 0x1000;
const BASE_HARVESTER     = 0x2000;
const BASE_CHARGER       = 0x3000;
const BASE_ASSEMBLER     = 0x4000;
const BASE_PROCESSOR     = 0x5000;
const BASE_SENSOR        = 0x6000;
const BASE_DISASSEMBLER  = 0x7000;
const BASE_FRAME         = 0x8000;
const BASE_MEMORYCORE    = 0x9000;

const QUERY_BASE = 0xA000;
const ID_RELEASE = 0xA010;

const SLOT_SIZE_ACTUATOR     = 8;
const SLOT_SIZE_HARVESTER    = 8;
const SLOT_SIZE_CHARGER      = 8;
const SLOT_SIZE_ASSEMBLER    = 16;
const SLOT_SIZE_PROCESSOR    = 8;
const SLOT_SIZE_SENSOR       = 16;
const SLOT_SIZE_DISASSEMBLER = 8;
const SLOT_SIZE_FRAME        = 4;
const SLOT_SIZE_MEMORYCORE   = 4;

// ============================================================
// Component type encoding for SENSE / Query
// ============================================================
const TYPE_ORE_NODE         = 1;
const TYPE_CRYSTAL_NODE     = 2;
const TYPE_ENERGY_NODE      = 3;
const TYPE_REMAINS          = 6;
const TYPE_ACTIVE_CHAR      = 7;
const TYPE_INACTIVE_CHAR    = 8;

// Item type mapping for inventory query (0-12)
const INVENTORY_ITEM_NAMES: readonly string[] = [
  'Ore', 'Crystal', 'Metal', 'Circuit',
  'Frame', 'Actuator', 'Harvester', 'Charger',
  'Assembler', 'Processor', 'Sensor', 'Disassembler', 'MemoryCore',
];

// Component type index used in ASSEMBLE I/O and discovery
const COMPONENT_ORDER: readonly ComponentType[] = [
  'Frame', 'Actuator', 'Harvester', 'Charger',
  'Assembler', 'Processor', 'Sensor', 'Disassembler', 'MemoryCore',
];

// ============================================================
// Action reservation types
// ============================================================
export interface MoveReservation {
  readonly op: 'MOVE';
  readonly slotIndex: number;
  readonly direction: number;
}

export interface HarvestReservation {
  readonly op: 'HARVEST';
  readonly slotIndex: number;
  readonly targetLocalId: number;  // 0 = nearest, non-zero = specific node by local ID
}

export interface RechargeReservation {
  readonly op: 'RECHARGE';
  readonly slotIndex: number;
  readonly targetLocalId: number;  // 0 = nearest, non-zero = specific energy node by local ID
}

export interface ProcessReservation {
  readonly op: 'PROCESS';
  readonly slotIndex: number;
  readonly recipe: number;
}

export interface CraftReservation {
  readonly op: 'CRAFT';
  readonly slotIndex: number;
  readonly componentType: number;
}

export interface AssembleReservation {
  readonly op: 'ASSEMBLE';
  readonly slotIndex: number;
  readonly components: readonly ComponentType[];
  readonly childLocalId: number;
}

export interface RepairReservation {
  readonly op: 'REPAIR';
  readonly slotIndex: number;
}

export interface WriteReservation {
  readonly op: 'WRITE';
  readonly slotIndex: number;
  readonly targetLocalId: number;
  readonly srcAddr: number;
  readonly dstAddr: number;
  readonly length: number;
}

export interface ActivateReservation {
  readonly op: 'ACTIVATE';
  readonly slotIndex: number;
  readonly targetLocalId: number;
}

export interface DisassembleReservation {
  readonly op: 'DISASSEMBLE';
  readonly slotIndex: number;
  readonly targetLocalId: number;
}

export interface SenseReservation {
  readonly op: 'SENSE';
  readonly slotIndex: number;
}

export type ActionReservation =
  | MoveReservation
  | HarvestReservation
  | RechargeReservation
  | ProcessReservation
  | CraftReservation
  | AssembleReservation
  | RepairReservation
  | WriteReservation
  | ActivateReservation
  | DisassembleReservation
  | SenseReservation;

// ============================================================
// SENSE result entry
// ============================================================
interface SenseEntry {
  readonly type: number;
  readonly angle: number;
  readonly distance: number;
  readonly systemId: string;
  readonly amount: number;
}

// ============================================================
// I/O handler result
// ============================================================
export interface IoResult {
  readonly reservations: readonly ActionReservation[];
  readonly updatedVmLocalIdTable: ReadonlyMap<number, string>;
  readonly updatedVmLocalIdCounter: number;
}

// ============================================================
// Slot data (mutable within tick)
// ============================================================
interface SlotData {
  [offset: number]: number;
}


// ============================================================
// Create I/O handler
// ============================================================
/** Pre-built lookup maps for O(1) ID resolution. Build once per tick. */
export interface WorldLookup {
  readonly characterById: ReadonlyMap<string, Character>;
  readonly resourceNodeById: ReadonlyMap<string, World['resourceNodes'][number]>;
  readonly energyNodeById: ReadonlyMap<string, World['energyNodes'][number]>;
  readonly remainsById: ReadonlyMap<string, World['remains'][number]>;
}

export function buildWorldLookup(world: World): WorldLookup {
  return {
    characterById: new Map(world.characters.map(c => [c.id, c])),
    resourceNodeById: new Map(world.resourceNodes.map(n => [n.id, n])),
    energyNodeById: new Map(world.energyNodes.map(n => [n.id, n])),
    remainsById: new Map(world.remains.map(r => [r.id, r])),
  };
}

export function createIoHandler(
  character: Character,
  world: World,
  params: GameParams,
  grid?: SpatialGrid,
  lookup?: WorldLookup,
): {
  ioRead: (addr: number) => number;
  ioWrite: (addr: number, value: number) => void;
  getResult: () => IoResult;
} {
  // Per-slot mutable state for argument buffering
  const actuatorSlots: Map<number, SlotData> = new Map();
  const harvesterSlots: Map<number, SlotData> = new Map();
  const chargerSlots: Map<number, SlotData> = new Map();
  const assemblerSlots: Map<number, SlotData> = new Map();
  const processorSlots: Map<number, SlotData> = new Map();
  const sensorSlots: Map<number, SlotData> = new Map();
  const disassemblerSlots: Map<number, SlotData> = new Map();

  // Reservations per slot key (keyed by "type:index")
  const reservationMap: Map<string, ActionReservation> = new Map();

  // Mutable local ID state
  let localIdTable = new Map(character.vm.localIdTable);
  let localIdCounter = character.vm.localIdCounter;
  // Reverse lookup: system ID -> local ID
  const reverseIdTable = new Map<string, number>();
  for (const [lid, sid] of localIdTable) {
    reverseIdTable.set(sid, lid);
  }

  // SENSE results per sensor slot
  const senseResults: Map<number, SenseEntry[]> = new Map();

  // Object lookup maps (O(1) by system ID) — shared across characters when provided
  const { characterById, resourceNodeById, energyNodeById, remainsById } =
    lookup ?? buildWorldLookup(world);

  // Query state
  let queryTargetId = 0;
  let queryValid = 0;
  let queryType = 0;
  let queryAngle = 0;
  let queryDistance = 0;
  let queryProp0 = 0;
  let queryProp1 = 0;
  let queryProp2 = 0;
  let queryProp3 = 0;

  // Discovery state
  let discType = 0;
  let discCmd = 0;
  let discIndex = 0;
  let discResult = 0;

  // Inventory query state
  let invQueryType = 0;
  let invQueryResult = 0;

  // Component counts
  const componentCounts: Map<ComponentType, number[]> = new Map();
  for (const comp of COMPONENT_ORDER) {
    componentCounts.set(comp, []);
  }
  for (let i = 0; i < character.components.length; i++) {
    const comp = character.components[i];
    const arr = componentCounts.get(comp)!;
    arr.push(i);
  }

  // Build per-type slot index arrays
  const componentSlotIndices: Map<ComponentType, number[]> = new Map();
  {
    const counters: Map<ComponentType, number> = new Map();
    for (const comp of character.components) {
      const idx = counters.get(comp) ?? 0;
      if (!componentSlotIndices.has(comp)) {
        componentSlotIndices.set(comp, []);
      }
      componentSlotIndices.get(comp)!.push(idx);
      counters.set(comp, idx + 1);
    }
  }

  function getSlotCountForType(type: ComponentType): number {
    return componentCounts.get(type)?.length ?? 0;
  }

  function hasSlot(type: ComponentType, index: number): boolean {
    const count = getSlotCountForType(type);
    return index >= 0 && index < count;
  }

  // ---- Address decode ----

  interface SlotRange { type: ComponentType; base: number; end: number; slotSize: number }
  const SLOT_RANGES: readonly SlotRange[] = [
    { type: 'Actuator',     base: BASE_ACTUATOR,     end: BASE_HARVESTER,        slotSize: SLOT_SIZE_ACTUATOR },
    { type: 'Harvester',    base: BASE_HARVESTER,    end: BASE_CHARGER,          slotSize: SLOT_SIZE_HARVESTER },
    { type: 'Charger',      base: BASE_CHARGER,      end: BASE_ASSEMBLER,        slotSize: SLOT_SIZE_CHARGER },
    { type: 'Assembler',    base: BASE_ASSEMBLER,    end: BASE_PROCESSOR,        slotSize: SLOT_SIZE_ASSEMBLER },
    { type: 'Processor',    base: BASE_PROCESSOR,    end: BASE_SENSOR,           slotSize: SLOT_SIZE_PROCESSOR },
    { type: 'Sensor',       base: BASE_SENSOR,       end: BASE_DISASSEMBLER,     slotSize: SLOT_SIZE_SENSOR },
    { type: 'Disassembler', base: BASE_DISASSEMBLER, end: BASE_FRAME,            slotSize: SLOT_SIZE_DISASSEMBLER },
    { type: 'Frame',        base: BASE_FRAME,        end: BASE_MEMORYCORE,       slotSize: SLOT_SIZE_FRAME },
    { type: 'MemoryCore',   base: BASE_MEMORYCORE,   end: BASE_MEMORYCORE + 0x1000, slotSize: SLOT_SIZE_MEMORYCORE },
  ];

  function decodeSlotAddress(addr: number): {
    type: ComponentType; index: number; offset: number;
  } | null {
    for (const r of SLOT_RANGES) {
      if (addr >= r.base && addr < r.end) {
        const rel = addr - r.base;
        return { type: r.type, index: Math.floor(rel / r.slotSize), offset: rel % r.slotSize };
      }
    }
    return null;
  }

  // ---- Local ID management ----

  function allocateLocalId(systemId: string): number {
    const existing = reverseIdTable.get(systemId);
    if (existing !== undefined) return existing;
    const lid = localIdCounter;
    localIdCounter++;
    localIdTable.set(lid, systemId);
    reverseIdTable.set(systemId, lid);
    return lid;
  }

  function releaseLocalId(lid: number): void {
    const sid = localIdTable.get(lid);
    if (sid !== undefined) {
      localIdTable.delete(lid);
      reverseIdTable.delete(sid);
    }
  }

  // ---- SENSE implementation ----

  function executeSense(sensorIndex: number, filterValue: number): void {
    const entries: SenseEntry[] = [];

    const targets = gatherSenseTargets(filterValue);

    // Sort by distance, then by system id
    targets.sort((a, b) => {
      const da = distance(character.position, a.position);
      const db = distance(character.position, b.position);
      if (da !== db) return da - db;
      return a.id.localeCompare(b.id);
    });

    // Take up to 4
    const max = Math.min(4, targets.length);
    for (let i = 0; i < max; i++) {
      const t = targets[i];
      const dx = t.position.x - character.position.x;
      const dy = t.position.y - character.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angleDeg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      entries.push({
        type: t.type,
        angle: Math.round(angleDeg) % 360,
        distance: Math.round(dist),
        systemId: t.id,
        amount: t.amount,
      });
    }

    senseResults.set(sensorIndex, entries);

    // Set result data into the sensor slot
    const slotData = getOrCreateSlotData(sensorSlots, sensorIndex);
    slotData[2] = entries.length; // result_count
    slotData[3] = 0; // entry_index = 0
    if (entries.length > 0) {
      slotData[4] = entries[0].type;
      slotData[5] = entries[0].angle;
      slotData[6] = entries[0].distance;
      slotData[9] = entries[0].amount;
    } else {
      slotData[4] = 0;
      slotData[5] = 0;
      slotData[6] = 0;
      slotData[9] = 0;
    }
    slotData[7] = 0; // register_cmd
    slotData[8] = 0; // registered_id
  }

  function executeSenseById(sensorIndex: number, localId: number): void {
    const slotData = getOrCreateSlotData(sensorSlots, sensorIndex);

    const systemId = localIdTable.get(localId);
    if (systemId === undefined) {
      slotData[4] = 0;
      slotData[5] = 0;
      slotData[6] = 0;
      slotData[9] = 0;
      return;
    }

    const target = findSenseByIdTarget(systemId);
    if (!target) {
      slotData[4] = 0;
      slotData[5] = 0;
      slotData[6] = 0;
      slotData[9] = 0;
      return;
    }

    const d = distance(character.position, target.position);
    if (d > params.senseRange) {
      slotData[4] = 0;
      slotData[5] = 0;
      slotData[6] = 0;
      slotData[9] = 0;
      return;
    }

    const dx = target.position.x - character.position.x;
    const dy = target.position.y - character.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angleDeg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;

    slotData[4] = target.type;
    slotData[5] = Math.round(angleDeg) % 360;
    slotData[6] = Math.round(dist);
    slotData[9] = target.amount;
  }

  function findSenseByIdTarget(systemId: string): { position: Position; type: number; amount: number } | null {
    const char = characterById.get(systemId);
    if (char) {
      const tc = isActive(char) ? TYPE_ACTIVE_CHAR : TYPE_INACTIVE_CHAR;
      return { position: char.position, type: tc, amount: 0 };
    }
    const rn = resourceNodeById.get(systemId);
    if (rn) {
      const tc = rn.type === 'OreNode' ? TYPE_ORE_NODE : TYPE_CRYSTAL_NODE;
      return { position: rn.position, type: tc, amount: rn.remaining };
    }
    const en = energyNodeById.get(systemId);
    if (en) {
      return { position: en.position, type: TYPE_ENERGY_NODE, amount: en.stored };
    }
    const rm = remainsById.get(systemId);
    if (rm) {
      return { position: rm.position, type: TYPE_REMAINS, amount: 0 };
    }
    return null;
  }

  interface SenseTarget {
    readonly id: string;
    readonly position: Position;
    readonly type: number;
    readonly amount: number;
  }

  function gatherSenseTargets(filterValue: number): SenseTarget[] {
    const results: SenseTarget[] = [];
    const range = params.senseRange;

    const shouldInclude = (typeCode: number): boolean => {
      switch (filterValue) {
        case 0: return true;
        case 1: return typeCode === TYPE_ORE_NODE;
        case 2: return typeCode === TYPE_CRYSTAL_NODE;
        case 3: return typeCode === TYPE_ENERGY_NODE;
        case 4: return typeCode === TYPE_ORE_NODE || typeCode === TYPE_CRYSTAL_NODE;
        case 5: return typeCode === TYPE_ORE_NODE || typeCode === TYPE_CRYSTAL_NODE || typeCode === TYPE_ENERGY_NODE;
        case 6: return typeCode === TYPE_REMAINS;
        case 7: return typeCode === TYPE_ACTIVE_CHAR;
        case 8: return typeCode === TYPE_INACTIVE_CHAR;
        case 9: return typeCode === TYPE_ACTIVE_CHAR || typeCode === TYPE_INACTIVE_CHAR;
        default: return true;
      }
    };

    if (grid) {
      const nearby = queryRange(grid, character.position, range);
      for (const entry of nearby) {
        if (entry.id === character.id) continue;
        const d = distance(character.position, entry.position);
        if (d > range) continue;

        if (entry.kind === 'resourceNode') {
          const node = resourceNodeById.get(entry.id);
          if (!node) continue;
          const tc = node.type === 'OreNode' ? TYPE_ORE_NODE : TYPE_CRYSTAL_NODE;
          if (shouldInclude(tc)) results.push({ id: entry.id, position: entry.position, type: tc, amount: node.remaining });
        } else if (entry.kind === 'energyNode') {
          if (shouldInclude(TYPE_ENERGY_NODE)) {
            const node = energyNodeById.get(entry.id);
            const amt = node ? node.stored : 0;
            results.push({ id: entry.id, position: entry.position, type: TYPE_ENERGY_NODE, amount: amt });
          }
        } else if (entry.kind === 'remains') {
          if (shouldInclude(TYPE_REMAINS)) results.push({ id: entry.id, position: entry.position, type: TYPE_REMAINS, amount: 0 });
        } else if (entry.kind === 'character') {
          const c = characterById.get(entry.id);
          if (!c) continue;
          const tc = isActive(c) ? TYPE_ACTIVE_CHAR : TYPE_INACTIVE_CHAR;
          if (shouldInclude(tc)) results.push({ id: entry.id, position: entry.position, type: tc, amount: 0 });
        }
      }
    } else {
      for (const node of world.resourceNodes) {
        const d = distance(character.position, node.position);
        if (d > range) continue;
        const tc = node.type === 'OreNode' ? TYPE_ORE_NODE : TYPE_CRYSTAL_NODE;
        if (shouldInclude(tc)) results.push({ id: node.id, position: node.position, type: tc, amount: node.remaining });
      }
      for (const node of world.energyNodes) {
        const d = distance(character.position, node.position);
        if (d > range) continue;
        if (shouldInclude(TYPE_ENERGY_NODE)) results.push({ id: node.id, position: node.position, type: TYPE_ENERGY_NODE, amount: node.stored });
      }
      for (const r of world.remains) {
        const d = distance(character.position, r.position);
        if (d > range) continue;
        if (shouldInclude(TYPE_REMAINS)) results.push({ id: r.id, position: r.position, type: TYPE_REMAINS, amount: 0 });
      }
      for (const c of world.characters) {
        if (c.id === character.id) continue;
        const d = distance(character.position, c.position);
        if (d > range) continue;
        const tc = isActive(c) ? TYPE_ACTIVE_CHAR : TYPE_INACTIVE_CHAR;
        if (shouldInclude(tc)) results.push({ id: c.id, position: c.position, type: tc, amount: 0 });
      }
    }

    return results;
  }

  // ---- Query implementation ----

  function executeQuery(): void {
    const sid = localIdTable.get(queryTargetId);
    if (sid === undefined) {
      clearQueryResults();
      return;
    }

    // Find the target object
    const target = findTargetObject(sid);
    if (!target) {
      clearQueryResults();
      return;
    }

    // Check range
    const d = distance(character.position, target.position);
    if (d > params.senseRange) {
      clearQueryResults();
      return;
    }

    queryValid = 1;
    queryType = target.type;
    const dx = target.position.x - character.position.x;
    const dy = target.position.y - character.position.y;
    queryAngle = Math.round(((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360) % 360;
    queryDistance = Math.round(d);

    // Type-dependent properties
    queryProp0 = target.prop0;
    queryProp1 = target.prop1;
    queryProp2 = target.prop2;
    queryProp3 = target.prop3;
  }

  interface TargetInfo {
    readonly position: Position;
    readonly type: number;
    readonly prop0: number;
    readonly prop1: number;
    readonly prop2: number;
    readonly prop3: number;
  }

  function findTargetObject(systemId: string): TargetInfo | null {
    const char = characterById.get(systemId);
    if (char) {
      const tc = isActive(char) ? TYPE_ACTIVE_CHAR : TYPE_INACTIVE_CHAR;
      if (isActive(char)) {
        return {
          position: char.position,
          type: tc,
          prop0: char.energy & 0xFFFF,
          prop1: char.durability & 0xFFFF,
          prop2: char.components.length & 0xFFFF,
          prop3: 0,
        };
      }
      return {
        position: char.position,
        type: tc,
        prop0: char.components.length & 0xFFFF,
        prop1: 0,
        prop2: 0,
        prop3: 0,
      };
    }

    const rn = resourceNodeById.get(systemId);
    if (rn) {
      const tc = rn.type === 'OreNode' ? TYPE_ORE_NODE : TYPE_CRYSTAL_NODE;
      return {
        position: rn.position,
        type: tc,
        prop0: rn.type === 'OreNode' ? 1 : 2,
        prop1: rn.remaining & 0xFFFF,
        prop2: 0,
        prop3: 0,
      };
    }

    const en = energyNodeById.get(systemId);
    if (en) {
      return {
        position: en.position,
        type: TYPE_ENERGY_NODE,
        prop0: 3,
        prop1: en.stored & 0xFFFF,
        prop2: 0,
        prop3: 0,
      };
    }

    const rm = remainsById.get(systemId);
    if (rm) {
      return {
        position: rm.position,
        type: TYPE_REMAINS,
        prop0: rm.components.length & 0xFFFF,
        prop1: 0,
        prop2: 0,
        prop3: 0,
      };
    }

    return null;
  }

  function clearQueryResults(): void {
    queryValid = 0;
    queryType = 0;
    queryAngle = 0;
    queryDistance = 0;
    queryProp0 = 0;
    queryProp1 = 0;
    queryProp2 = 0;
    queryProp3 = 0;
  }

  // ---- Helpers ----

  function getOrCreateSlotData(map: Map<number, SlotData>, index: number): SlotData {
    let data = map.get(index);
    if (!data) {
      data = {};
      map.set(index, data);
    }
    return data;
  }

  // ---- ioRead ----

  function ioRead(addr: number): number {
    // Global area
    if (addr === IO_ENERGY) return Math.min(character.energy, 0xFFFF);
    if (addr === IO_DURABILITY) return Math.min(Math.max(0, character.durability), 0xFFFF);
    if (addr === IO_POS_X) return Math.round(character.position.x) & 0xFFFF;
    if (addr === IO_POS_Y) return Math.round(character.position.y) & 0xFFFF;
    if (addr === IO_VEL_X) {
      const v = Math.round(character.velocity.vx);
      return ((v % 0x10000) + 0x10000) & 0xFFFF;
    }
    if (addr === IO_VEL_Y) {
      const v = Math.round(character.velocity.vy);
      return ((v % 0x10000) + 0x10000) & 0xFFFF;
    }
    if (addr === IO_TICK) return world.tick & 0xFFFF;

    // Discovery area
    if (addr === COMP_DISC_BASE + 2) return discResult & 0xFFFF;

    // Inventory query result
    if (addr === INVENTORY_RESULT) return invQueryResult & 0xFFFF;

    // Query area
    if (addr === QUERY_BASE + 0) return queryTargetId & 0xFFFF;
    if (addr === QUERY_BASE + 2) return queryValid;
    if (addr === QUERY_BASE + 3) return queryType;
    if (addr === QUERY_BASE + 4) return queryAngle & 0xFFFF;
    if (addr === QUERY_BASE + 5) return queryDistance & 0xFFFF;
    if (addr === QUERY_BASE + 6) return queryProp0 & 0xFFFF;
    if (addr === QUERY_BASE + 7) return queryProp1 & 0xFFFF;
    if (addr === QUERY_BASE + 8) return queryProp2 & 0xFFFF;
    if (addr === QUERY_BASE + 9) return queryProp3 & 0xFFFF;

    // Component slot reads
    const slot = decodeSlotAddress(addr);
    if (!slot) return 0;

    // status field (offset 0)
    if (slot.offset === 0) {
      return hasSlot(slot.type, slot.index) ? 1 : 0;
    }

    // Sensor result reads
    if (slot.type === 'Sensor' && hasSlot('Sensor', slot.index)) {
      const data = sensorSlots.get(slot.index);
      if (data && slot.offset >= 2 && slot.offset <= 9) {
        return (data[slot.offset] ?? 0) & 0xFFFF;
      }
    }

    // Assembler result read (child_local_id after ASSEMBLE)
    if (slot.type === 'Assembler' && hasSlot('Assembler', slot.index)) {
      const data = assemblerSlots.get(slot.index);
      if (data && slot.offset >= 2) {
        return (data[slot.offset] ?? 0) & 0xFFFF;
      }
    }

    // Other slots: read buffered arg data
    if (slot.type === 'Actuator') {
      const data = actuatorSlots.get(slot.index);
      return data ? (data[slot.offset] ?? 0) & 0xFFFF : 0;
    }
    if (slot.type === 'Processor') {
      const data = processorSlots.get(slot.index);
      return data ? (data[slot.offset] ?? 0) & 0xFFFF : 0;
    }
    if (slot.type === 'Disassembler') {
      const data = disassemblerSlots.get(slot.index);
      return data ? (data[slot.offset] ?? 0) & 0xFFFF : 0;
    }

    return 0;
  }

  // ---- ioWrite ----

  function ioWrite(addr: number, value: number): void {
    const v = value & 0xFFFF;

    // ID Release
    if (addr === ID_RELEASE) {
      releaseLocalId(v);
      return;
    }

    // Discovery writes
    if (addr === COMP_DISC_BASE) {
      discType = v;
      return;
    }
    if (addr === COMP_DISC_BASE + 1) {
      discCmd = v;
      handleDiscovery();
      return;
    }
    if (addr === COMP_DISC_BASE + 3) {
      discIndex = v;
      return;
    }

    // Inventory query writes
    if (addr === INVENTORY_TYPE) {
      invQueryType = v;
      return;
    }
    if (addr === INVENTORY_CMD) {
      if (v === 1) {
        handleInventoryQuery();
      }
      return;
    }

    // Query writes
    if (addr === QUERY_BASE + 0) {
      queryTargetId = v;
      return;
    }
    if (addr === QUERY_BASE + 1) {
      executeQuery();
      return;
    }

    // Component slot writes
    const slot = decodeSlotAddress(addr);
    if (!slot) return;
    if (!hasSlot(slot.type, slot.index)) return;

    // Command write (offset 1) triggers reservation
    if (slot.offset === 1) {
      handleCommand(slot.type, slot.index, v);
      return;
    }

    // Argument writes (buffered)
    switch (slot.type) {
      case 'Actuator': {
        const data = getOrCreateSlotData(actuatorSlots, slot.index);
        data[slot.offset] = v;
        break;
      }
      case 'Harvester': {
        const data = getOrCreateSlotData(harvesterSlots, slot.index);
        data[slot.offset] = v;
        break;
      }
      case 'Charger': {
        const data = getOrCreateSlotData(chargerSlots, slot.index);
        data[slot.offset] = v;
        break;
      }
      case 'Assembler': {
        const data = getOrCreateSlotData(assemblerSlots, slot.index);
        data[slot.offset] = v;
        break;
      }
      case 'Processor': {
        const data = getOrCreateSlotData(processorSlots, slot.index);
        data[slot.offset] = v;
        break;
      }
      case 'Sensor': {
        const data = getOrCreateSlotData(sensorSlots, slot.index);
        // entry_index write switches the selected entry
        if (slot.offset === 3) {
          data[3] = v;
          updateSensorEntryView(slot.index);
          return;
        }
        // register_cmd write
        if (slot.offset === 7 && v === 1) {
          handleSensorRegister(slot.index);
          return;
        }
        data[slot.offset] = v;
        break;
      }
      case 'Disassembler': {
        const data = getOrCreateSlotData(disassemblerSlots, slot.index);
        data[slot.offset] = v;
        break;
      }
      // Frame and MemoryCore have no writable fields beyond status
    }
  }

  function updateSensorEntryView(sensorIndex: number): void {
    const entries = senseResults.get(sensorIndex);
    const data = sensorSlots.get(sensorIndex);
    if (!data || !entries) return;
    const idx = data[3] ?? 0;
    if (idx >= 0 && idx < entries.length) {
      data[4] = entries[idx].type;
      data[5] = entries[idx].angle;
      data[6] = entries[idx].distance;
      data[9] = entries[idx].amount;
    } else {
      data[4] = 0;
      data[5] = 0;
      data[6] = 0;
      data[9] = 0;
    }
  }

  function handleSensorRegister(sensorIndex: number): void {
    const entries = senseResults.get(sensorIndex);
    const data = sensorSlots.get(sensorIndex);
    if (!data || !entries) return;
    const idx = data[3] ?? 0;
    if (idx >= 0 && idx < entries.length) {
      const entry = entries[idx];
      const lid = allocateLocalId(entry.systemId);
      data[8] = lid;
    } else {
      data[8] = 0;
    }
  }

  function handleCommand(type: ComponentType, index: number, cmd: number): void {
    const key = `${type}:${index}`;

    switch (type) {
      case 'Actuator': {
        if (cmd === 1) {
          const data = actuatorSlots.get(index) ?? {};
          const direction = data[2] ?? 0;
          reservationMap.set(key, { op: 'MOVE', slotIndex: index, direction });
          // Clear args, write results
          const slotData = getOrCreateSlotData(actuatorSlots, index);
          slotData[2] = 0;
        }
        break;
      }
      case 'Harvester': {
        if (cmd === 1) {
          const data = harvesterSlots.get(index) ?? {};
          const targetLocalId = data[2] ?? 0;
          reservationMap.set(key, { op: 'HARVEST', slotIndex: index, targetLocalId });
        }
        break;
      }
      case 'Charger': {
        if (cmd === 1) {
          const data = chargerSlots.get(index) ?? {};
          const targetLocalId = data[2] ?? 0;
          reservationMap.set(key, { op: 'RECHARGE', slotIndex: index, targetLocalId });
        }
        break;
      }
      case 'Assembler': {
        handleAssemblerCommand(index, cmd, key);
        break;
      }
      case 'Processor': {
        handleProcessorCommand(index, cmd, key);
        break;
      }
      case 'Sensor': {
        if (cmd === 1) {
          const data = sensorSlots.get(index) ?? {};
          const filter = data[2] ?? 0;
          // SENSE executes immediately (results available within same tick)
          executeSense(index, filter);
          // Register reservation for energy cost tracking
          reservationMap.set(key, { op: 'SENSE', slotIndex: index });
        } else if (cmd === 2) {
          const data = sensorSlots.get(index) ?? {};
          const localId = data[2] ?? 0;
          // ID SENSE executes immediately
          executeSenseById(index, localId);
          // Register reservation for energy cost tracking
          reservationMap.set(key, { op: 'SENSE', slotIndex: index });
        }
        break;
      }
      case 'Disassembler': {
        if (cmd === 1) {
          const data = disassemblerSlots.get(index) ?? {};
          const targetLocalId = data[2] ?? 0;
          reservationMap.set(key, { op: 'DISASSEMBLE', slotIndex: index, targetLocalId });
          const slotData = getOrCreateSlotData(disassemblerSlots, index);
          slotData[2] = 0;
        }
        break;
      }
    }
  }

  function handleAssemblerCommand(index: number, cmd: number, key: string): void {
    const data = assemblerSlots.get(index) ?? {};

    switch (cmd) {
      case 1: { // PROCESS
        const recipe = data[2] ?? 0;
        reservationMap.set(key, { op: 'PROCESS', slotIndex: index, recipe });
        const slotData = getOrCreateSlotData(assemblerSlots, index);
        slotData[2] = 0;
        break;
      }
      case 2: { // CRAFT
        const componentType = data[2] ?? 0;
        reservationMap.set(key, { op: 'CRAFT', slotIndex: index, componentType });
        const slotData = getOrCreateSlotData(assemblerSlots, index);
        slotData[2] = 0;
        break;
      }
      case 3: { // ASSEMBLE
        const components: ComponentType[] = [];
        const counts = [
          { type: 'Frame' as ComponentType, count: data[2] ?? 0 },
          { type: 'Actuator' as ComponentType, count: data[3] ?? 0 },
          { type: 'Harvester' as ComponentType, count: data[4] ?? 0 },
          { type: 'Charger' as ComponentType, count: data[5] ?? 0 },
          { type: 'Assembler' as ComponentType, count: data[6] ?? 0 },
          { type: 'Processor' as ComponentType, count: data[7] ?? 0 },
          { type: 'Sensor' as ComponentType, count: data[8] ?? 0 },
          { type: 'Disassembler' as ComponentType, count: data[9] ?? 0 },
          { type: 'MemoryCore' as ComponentType, count: data[0x0A] ?? 0 },
        ];
        for (const { type, count } of counts) {
          for (let i = 0; i < count; i++) {
            components.push(type);
          }
        }

        // Allocate a local ID for the child (will be confirmed at action execution)
        // Use a placeholder system ID - the actual ID will be assigned during action execution
        const childLocalId = localIdCounter;
        localIdCounter++;
        // We store it in the table temporarily with a placeholder
        localIdTable.set(childLocalId, `__pending_child_${childLocalId}`);

        reservationMap.set(key, {
          op: 'ASSEMBLE',
          slotIndex: index,
          components,
          childLocalId,
        });

        // Write result: child_local_id
        const slotData = getOrCreateSlotData(assemblerSlots, index);
        slotData[2] = childLocalId;
        // Clear the rest
        for (let i = 3; i <= 0x0A; i++) {
          slotData[i] = 0;
        }
        break;
      }
      case 4: { // REPAIR
        reservationMap.set(key, { op: 'REPAIR', slotIndex: index });
        break;
      }
    }
  }

  function handleProcessorCommand(index: number, cmd: number, key: string): void {
    const data = processorSlots.get(index) ?? {};

    switch (cmd) {
      case 1: { // WRITE
        const targetLocalId = data[2] ?? 0;
        const srcAddr = data[3] ?? 0;
        const dstAddr = data[4] ?? 0;
        const length = data[5] ?? 0;
        reservationMap.set(key, {
          op: 'WRITE',
          slotIndex: index,
          targetLocalId,
          srcAddr,
          dstAddr,
          length,
        });
        const slotData = getOrCreateSlotData(processorSlots, index);
        for (let i = 2; i <= 5; i++) slotData[i] = 0;
        break;
      }
      case 2: { // ACTIVATE
        const targetLocalId = data[2] ?? 0;
        reservationMap.set(key, {
          op: 'ACTIVATE',
          slotIndex: index,
          targetLocalId,
        });
        const slotData = getOrCreateSlotData(processorSlots, index);
        slotData[2] = 0;
        break;
      }
    }
  }

  function handleInventoryQuery(): void {
    const itemName = INVENTORY_ITEM_NAMES[invQueryType];
    if (itemName === undefined) {
      invQueryResult = 0;
      return;
    }
    invQueryResult = (character.inventory[itemName] ?? 0);
  }

  function handleDiscovery(): void {
    // discType is the component type index, discCmd is the sub-command
    const typeIndex = discType;
    // Map type index to ComponentType using the bases:
    // 1=Actuator, 2=Harvester, 3=Charger, 4=Assembler,
    // 5=Processor, 6=Sensor, 7=Disassembler, 8=Frame, 9=MemoryCore
    const compType = indexToComponentType(typeIndex);
    if (!compType) {
      discResult = 0;
      return;
    }

    const count = getSlotCountForType(compType);

    switch (discCmd) {
      case 1: // component_count
        discResult = count;
        break;
      case 2: // component_total (max index + 1)
        discResult = count; // since indices are 0..count-1 with no gaps
        break;
      case 3: // component_status for specific index
        discResult = hasSlot(compType, discIndex) ? 1 : 0;
        break;
      default:
        discResult = 0;
    }
  }

  function indexToComponentType(index: number): ComponentType | null {
    switch (index) {
      case 1: return 'Actuator';
      case 2: return 'Harvester';
      case 3: return 'Charger';
      case 4: return 'Assembler';
      case 5: return 'Processor';
      case 6: return 'Sensor';
      case 7: return 'Disassembler';
      case 8: return 'Frame';
      case 9: return 'MemoryCore';
      default: return null;
    }
  }

  // ---- getResult ----

  function getResult(): IoResult {
    return {
      reservations: [...reservationMap.values()],
      updatedVmLocalIdTable: new Map(localIdTable),
      updatedVmLocalIdCounter: localIdCounter,
    };
  }

  return { ioRead, ioWrite, getResult };
}
