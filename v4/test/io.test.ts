import { describe, it, expect } from 'vitest';
import { createIoHandler } from '../src/io.js';
import { createCharacterEngine } from '../src/character.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { Character, ComponentType, World } from '../src/types.js';
import { createGroundGrid, groundGridDimensions } from '../src/ground.js';

// ============================================================
// Helpers
// ============================================================

const params = DEFAULT_GAME_PARAMS;
const charEngine = createCharacterEngine(params);

const BASE_COMPONENTS: readonly ComponentType[] = [
  'Frame', 'Actuator', 'Sensor', 'Processor',
  'Harvester', 'Assembler', 'Charger', 'MemoryCore',
];

function makeWorld(overrides?: Partial<World>): World {
  const base: World = {
    width: 60,
    height: 60,
    resourceNodes: [],
    energyNodes: [],
    remains: [],
    characters: [],
    groundGrid: createGroundGrid(60, 60),
    nextCharacterId: 1,
    nextObjectId: 1,
    tick: 42,
  };
  return { ...base, ...overrides };
}

function makeCharacter(overrides?: Partial<Character>): Character {
  const ch = charEngine.createCharacter(
    'c-001', { x: 10, y: 20 }, BASE_COMPONENTS, [0], 1000, 'testSpecies', 0,
  );
  return { ...ch, ...overrides };
}

// ============================================================
// I/O address constants (mirrored from io.ts)
// ============================================================
const IO_ENERGY     = 0x0000;
const IO_DURABILITY = 0x0001;
const IO_POS_X      = 0x0002;
const IO_POS_Y      = 0x0003;
const IO_VEL_X      = 0x0004;
const IO_VEL_Y      = 0x0005;
const IO_TICK       = 0x0006;

const BASE_ACTUATOR     = 0x1000;
const BASE_HARVESTER    = 0x2000;
const BASE_CHARGER      = 0x3000;
const BASE_ASSEMBLER    = 0x4000;
const BASE_PROCESSOR    = 0x5000;
const BASE_SENSOR       = 0x6000;
const BASE_DISASSEMBLER = 0x7000;

const SLOT_SIZE_ACTUATOR  = 8;
const SLOT_SIZE_SENSOR    = 16;
const SLOT_SIZE_PROCESSOR = 8;

const QUERY_BASE = 0xA000;
const ID_RELEASE = 0xA010;

const COMP_DISC_BASE = 0x0010;

// ============================================================
// Tests: ioRead — global area
// ============================================================

describe('ioRead — global area', () => {
  it('reads energy', () => {
    const ch = makeCharacter({ energy: 750 });
    const world = makeWorld({ characters: [ch] });
    const { ioRead } = createIoHandler(ch, world, params);
    expect(ioRead(IO_ENERGY)).toBe(750);
  });

  it('clamps energy to 0xFFFF', () => {
    const ch = makeCharacter({ energy: 100_000 });
    const world = makeWorld({ characters: [ch] });
    const { ioRead } = createIoHandler(ch, world, params);
    expect(ioRead(IO_ENERGY)).toBe(0xFFFF);
  });

  it('reads durability', () => {
    const ch = makeCharacter({ durability: 200 });
    const world = makeWorld({ characters: [ch] });
    const { ioRead } = createIoHandler(ch, world, params);
    expect(ioRead(IO_DURABILITY)).toBe(200);
  });

  it('reads position x and y', () => {
    const ch = makeCharacter({ position: { x: 15.7, y: 28.3 } });
    const world = makeWorld({ characters: [ch] });
    const { ioRead } = createIoHandler(ch, world, params);
    expect(ioRead(IO_POS_X)).toBe(16);  // Math.round(15.7) = 16
    expect(ioRead(IO_POS_Y)).toBe(28);  // Math.round(28.3) = 28
  });

  it('reads velocity as unsigned 16-bit', () => {
    const ch = makeCharacter({ velocity: { vx: -3, vy: 5 } });
    const world = makeWorld({ characters: [ch] });
    const { ioRead } = createIoHandler(ch, world, params);
    // -3 rounds to -3, then (((-3 % 0x10000) + 0x10000) & 0xFFFF) = 0xFFFD
    expect(ioRead(IO_VEL_X)).toBe(0xFFFD);
    expect(ioRead(IO_VEL_Y)).toBe(5);
  });

  it('reads tick', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch], tick: 42 });
    const { ioRead } = createIoHandler(ch, world, params);
    expect(ioRead(IO_TICK)).toBe(42);
  });
});

// ============================================================
// Tests: ioWrite — action reservation (command-last protocol)
// ============================================================

describe('ioWrite — action reservation', () => {
  it('MOVE: write direction then command=1 reserves MOVE', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    // Actuator slot 0: offset 2 = direction, offset 1 = command
    handler.ioWrite(BASE_ACTUATOR + 2, 90);  // direction = 90 degrees
    handler.ioWrite(BASE_ACTUATOR + 1, 1);   // command = 1 (MOVE)

    const result = handler.getResult();
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]).toMatchObject({
      op: 'MOVE',
      slotIndex: 0,
      direction: 90,
    });
  });

  it('HARVEST: command=1 on harvester reserves HARVEST', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    handler.ioWrite(BASE_HARVESTER + 1, 1);

    const result = handler.getResult();
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]).toMatchObject({
      op: 'HARVEST',
      slotIndex: 0,
    });
  });

  it('RECHARGE: command=1 on charger reserves RECHARGE', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    handler.ioWrite(BASE_CHARGER + 1, 1);

    const result = handler.getResult();
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]).toMatchObject({
      op: 'RECHARGE',
      slotIndex: 0,
    });
  });

  it('PROCESS: write recipe then command=1 on assembler', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    handler.ioWrite(BASE_ASSEMBLER + 2, 1);  // recipe = 1 (Metal)
    handler.ioWrite(BASE_ASSEMBLER + 1, 1);  // command = 1 (PROCESS)

    const result = handler.getResult();
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]).toMatchObject({
      op: 'PROCESS',
      slotIndex: 0,
      recipe: 1,
    });
  });

  it('CRAFT: write componentType then command=2 on assembler', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    handler.ioWrite(BASE_ASSEMBLER + 2, 1);  // componentType = 1 (Frame)
    handler.ioWrite(BASE_ASSEMBLER + 1, 2);  // command = 2 (CRAFT)

    const result = handler.getResult();
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]).toMatchObject({
      op: 'CRAFT',
      slotIndex: 0,
      componentType: 1,
    });
  });

  it('REPAIR: command=4 on assembler reserves REPAIR', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    handler.ioWrite(BASE_ASSEMBLER + 1, 4);

    const result = handler.getResult();
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]).toMatchObject({
      op: 'REPAIR',
      slotIndex: 0,
    });
  });

  it('command-last overwrites previous reservation on same slot', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    // First MOVE at direction 90
    handler.ioWrite(BASE_ACTUATOR + 2, 90);
    handler.ioWrite(BASE_ACTUATOR + 1, 1);

    // Second MOVE at direction 180 on the same slot
    handler.ioWrite(BASE_ACTUATOR + 2, 180);
    handler.ioWrite(BASE_ACTUATOR + 1, 1);

    const result = handler.getResult();
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]).toMatchObject({
      op: 'MOVE',
      direction: 180,
    });
  });

  it('multiple reservations from different component types', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    // MOVE
    handler.ioWrite(BASE_ACTUATOR + 2, 45);
    handler.ioWrite(BASE_ACTUATOR + 1, 1);

    // HARVEST
    handler.ioWrite(BASE_HARVESTER + 1, 1);

    const result = handler.getResult();
    expect(result.reservations).toHaveLength(2);
    const ops = result.reservations.map(r => r.op);
    expect(ops).toContain('MOVE');
    expect(ops).toContain('HARVEST');
  });
});

// ============================================================
// Tests: SENSE immediate execution
// ============================================================

describe('SENSE immediate execution', () => {
  it('SENSE returns results within the same tick', () => {
    // Place an energy node within sense range
    const ch = makeCharacter({ position: { x: 10, y: 10 } });
    const world = makeWorld({
      characters: [ch],
      energyNodes: [{
        id: 'en-001',
        position: { x: 12, y: 10 },
        productionRate: 100,
        stored: 500,
        maxStored: 1000,
        createdAt: 0,
      }],
    });
    const handler = createIoHandler(ch, world, params);

    // Write filter = 0 (all), then command = 1 to sensor slot 0
    handler.ioWrite(BASE_SENSOR + 2, 0);   // filter = 0 (all types)
    handler.ioWrite(BASE_SENSOR + 1, 1);   // command = 1 (SENSE)

    // Read result_count (sensor slot 0, offset 2)
    const count = handler.ioRead(BASE_SENSOR + 2);
    expect(count).toBe(1);

    // Read first entry type (offset 4)
    const entryType = handler.ioRead(BASE_SENSOR + 4);
    expect(entryType).toBe(3); // TYPE_ENERGY_NODE = 3

    // Read distance (offset 6) - should be 2 (rounded)
    const dist = handler.ioRead(BASE_SENSOR + 6);
    expect(dist).toBe(2);

    // Reservation exists for energy cost
    const result = handler.getResult();
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0].op).toBe('SENSE');
  });

  it('SENSE with filter narrows results', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 } });
    const world = makeWorld({
      characters: [ch],
      resourceNodes: [{
        id: 'rn-001',
        position: { x: 12, y: 10 },
        type: 'OreNode',
        remaining: 100,
        createdAt: 0,
      }],
      energyNodes: [{
        id: 'en-001',
        position: { x: 11, y: 10 },
        productionRate: 100,
        stored: 500,
        maxStored: 1000,
        createdAt: 0,
      }],
    });
    const handler = createIoHandler(ch, world, params);

    // Filter = 1 (OreNode only)
    handler.ioWrite(BASE_SENSOR + 2, 1);
    handler.ioWrite(BASE_SENSOR + 1, 1);

    const count = handler.ioRead(BASE_SENSOR + 2);
    expect(count).toBe(1);

    const entryType = handler.ioRead(BASE_SENSOR + 4);
    expect(entryType).toBe(1); // TYPE_ORE_NODE = 1
  });
});

// ============================================================
// Tests: local ID registration
// ============================================================

describe('local ID registration', () => {
  it('SENSE register allocates a local ID for a sensed target', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 } });
    const world = makeWorld({
      characters: [ch],
      energyNodes: [{
        id: 'en-001',
        position: { x: 12, y: 10 },
        productionRate: 100,
        stored: 500,
        maxStored: 1000,
        createdAt: 0,
      }],
    });
    const handler = createIoHandler(ch, world, params);

    // Perform SENSE
    handler.ioWrite(BASE_SENSOR + 2, 0);
    handler.ioWrite(BASE_SENSOR + 1, 1);

    // Set entry_index = 0 (first entry)
    handler.ioWrite(BASE_SENSOR + 3, 0);

    // Write register_cmd = 1 (offset 7)
    handler.ioWrite(BASE_SENSOR + 7, 1);

    // Read registered_id (offset 8)
    const localId = handler.ioRead(BASE_SENSOR + 8);
    expect(localId).toBeGreaterThanOrEqual(0);

    // The local ID should appear in the updated table
    const result = handler.getResult();
    expect(result.updatedVmLocalIdTable.get(localId)).toBe('en-001');
  });

  it('ID_RELEASE removes a local ID from the table', () => {
    // Start with an existing local ID
    const ch = makeCharacter();
    const chWithId: Character = {
      ...ch,
      vm: {
        ...ch.vm,
        localIdTable: new Map([[5, 'en-001']]),
        localIdCounter: 6,
      },
    };
    const world = makeWorld({ characters: [chWithId] });
    const handler = createIoHandler(chWithId, world, params);

    // Release local ID 5
    handler.ioWrite(ID_RELEASE, 5);

    const result = handler.getResult();
    expect(result.updatedVmLocalIdTable.has(5)).toBe(false);
  });
});

// ============================================================
// Tests: component slot status
// ============================================================

describe('ioRead — component slot status', () => {
  it('returns 1 for existing slot, 0 for missing', () => {
    const ch = makeCharacter(); // has 1 of each base component
    const world = makeWorld({ characters: [ch] });
    const { ioRead } = createIoHandler(ch, world, params);

    // Actuator slot 0 exists
    expect(ioRead(BASE_ACTUATOR + 0)).toBe(1);
    // Actuator slot 1 does not exist (only 1 Actuator)
    expect(ioRead(BASE_ACTUATOR + SLOT_SIZE_ACTUATOR + 0)).toBe(0);
  });
});

// ============================================================
// Tests: WRITE reservation via Processor
// ============================================================

describe('ioWrite — WRITE reservation', () => {
  it('reserves WRITE with target, src, dst, length', () => {
    const ch = makeCharacter({
      vm: {
        ...makeCharacter().vm,
        localIdTable: new Map([[1, 'c-002']]),
        localIdCounter: 2,
      },
    });
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    // Processor slot 0: offset 2 = targetLocalId, 3 = srcAddr, 4 = dstAddr, 5 = length
    handler.ioWrite(BASE_PROCESSOR + 2, 1);    // targetLocalId = 1
    handler.ioWrite(BASE_PROCESSOR + 3, 0);    // srcAddr = 0
    handler.ioWrite(BASE_PROCESSOR + 4, 100);  // dstAddr = 100
    handler.ioWrite(BASE_PROCESSOR + 5, 50);   // length = 50
    handler.ioWrite(BASE_PROCESSOR + 1, 1);    // command = 1 (WRITE)

    const result = handler.getResult();
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]).toMatchObject({
      op: 'WRITE',
      targetLocalId: 1,
      srcAddr: 0,
      dstAddr: 100,
      length: 50,
    });
  });
});

// ============================================================
// Tests: ASSEMBLE reservation
// ============================================================

describe('ioWrite — ASSEMBLE reservation', () => {
  it('reserves ASSEMBLE with component counts and allocates child local ID', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    // Assembler slot 0: offsets 2-10 = component counts (Frame..MemoryCore)
    handler.ioWrite(BASE_ASSEMBLER + 2, 1);   // Frame count = 1
    handler.ioWrite(BASE_ASSEMBLER + 3, 1);   // Actuator count = 1
    handler.ioWrite(BASE_ASSEMBLER + 0x0A, 1); // MemoryCore count = 1
    handler.ioWrite(BASE_ASSEMBLER + 1, 3);   // command = 3 (ASSEMBLE)

    const result = handler.getResult();
    expect(result.reservations).toHaveLength(1);
    const res = result.reservations[0];
    expect(res.op).toBe('ASSEMBLE');
    if (res.op === 'ASSEMBLE') {
      expect(res.components).toContain('Frame');
      expect(res.components).toContain('Actuator');
      expect(res.components).toContain('MemoryCore');
      expect(res.components).toHaveLength(3);
      // childLocalId should be allocated
      expect(res.childLocalId).toBeGreaterThanOrEqual(0);
      // The child local ID should be in the updated table (with pending placeholder)
      expect(result.updatedVmLocalIdTable.has(res.childLocalId)).toBe(true);
    }
  });
});

// ============================================================
// Tests: Discovery
// ============================================================

describe('ioWrite/ioRead — discovery', () => {
  it('discovers component count', () => {
    const ch = makeCharacter(); // has 1 of each base component
    const world = makeWorld({ characters: [ch] });
    const handler = createIoHandler(ch, world, params);

    // Set discType = 1 (Actuator)
    handler.ioWrite(COMP_DISC_BASE, 1);
    // Set discCmd = 1 (component_count)
    handler.ioWrite(COMP_DISC_BASE + 1, 1);

    // Read result
    const count = handler.ioRead(COMP_DISC_BASE + 2);
    expect(count).toBe(1);
  });
});
