import { describe, it, expect } from 'vitest';
import { createActionEngine } from '../src/actions.js';
import type { ActionEngine } from '../src/actions.js';
import type { MoveReservation, HarvestReservation, RechargeReservation, WriteReservation, AssembleReservation, DisassembleReservation } from '../src/io.js';
import { createCharacterEngine } from '../src/character.js';
import { createRecipeEngine } from '../src/recipes.js';
import { createWorldEngine } from '../src/world.js';
import { createForceMap } from '../src/physics.js';
import type { ForceMap } from '../src/physics.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import type { Character, ComponentType, World } from '../src/types.js';
import { createGroundGrid } from '../src/ground.js';

// ============================================================
// Setup
// ============================================================

const params = DEFAULT_GAME_PARAMS;
const recipeEngine = createRecipeEngine(params);
const worldEngine = createWorldEngine(params);
const characterEngine = createCharacterEngine(params);
const actionEngine = createActionEngine(params, {
  recipeEngine,
  worldEngine,
  characterEngine,
});

const BASE_COMPONENTS: readonly ComponentType[] = [
  'Frame', 'Actuator', 'Sensor', 'Processor',
  'Harvester', 'Assembler', 'Charger', 'MemoryCore',
];

// Components for a character that can do everything including disassemble
const FULL_COMPONENTS: readonly ComponentType[] = [
  'Frame', 'Actuator', 'Sensor', 'Processor',
  'Harvester', 'Assembler', 'Charger', 'MemoryCore', 'Disassembler',
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
    nextCharacterId: 10,
    nextObjectId: 10,
    tick: 0,
  };
  return { ...base, ...overrides };
}

function makeCharacter(overrides?: Partial<Character>): Character {
  const ch = characterEngine.createCharacter(
    'c-001', { x: 10, y: 10 }, BASE_COMPONENTS, [0], 5000, 'testSpecies', 0,
  );
  return { ...ch, ...overrides };
}

function makeFullCharacter(overrides?: Partial<Character>): Character {
  const ch = characterEngine.createCharacter(
    'c-001', { x: 10, y: 10 }, FULL_COMPONENTS, [0], 5000, 'testSpecies', 0,
  );
  return { ...ch, ...overrides };
}

// ============================================================
// Tests: MOVE reservation
// ============================================================

describe('executeReservations — MOVE', () => {
  it('adds force for MOVE direction', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const forces = createForceMap();
    const localIdTable = new Map<number, string>();

    const reservation: MoveReservation = { op: 'MOVE', slotIndex: 0, direction: 0 };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], localIdTable, forces,
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ op: 'MOVE', success: true });

    // Check force was added (direction 0 = east = positive fx)
    const force = forces.get('c-001');
    expect(force).toBeDefined();
    expect(force!.fx).toBeCloseTo(params.moveForce);
    expect(force!.fy).toBeCloseTo(0);
  });

  it('MOVE at 90 degrees applies force in positive y direction', () => {
    const ch = makeCharacter();
    const world = makeWorld({ characters: [ch] });
    const forces = createForceMap();

    const reservation: MoveReservation = { op: 'MOVE', slotIndex: 0, direction: 90 };
    actionEngine.executeReservations(
      world, 'c-001', [reservation], new Map(), forces,
    );

    const force = forces.get('c-001');
    expect(force).toBeDefined();
    expect(force!.fx).toBeCloseTo(0, 5);
    expect(force!.fy).toBeCloseTo(params.moveForce);
  });

  it('MOVE deducts energy cost', () => {
    const ch = makeCharacter({ energy: 500 });
    const world = makeWorld({ characters: [ch] });
    const forces = createForceMap();

    const reservation: MoveReservation = { op: 'MOVE', slotIndex: 0, direction: 0 };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], new Map(), forces,
    );

    const updated = result.world.characters.find(c => c.id === 'c-001')!;
    expect(updated.energy).toBe(500 - params.energyCosts['MOVE']);
  });

  it('MOVE fails when energy is insufficient', () => {
    const ch = makeCharacter({ energy: 0 });
    const world = makeWorld({ characters: [ch] });
    const forces = createForceMap();

    const reservation: MoveReservation = { op: 'MOVE', slotIndex: 0, direction: 0 };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], new Map(), forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'MOVE', success: false });
    // No force should be added
    expect(forces.has('c-001')).toBe(false);
  });
});

// ============================================================
// Tests: HARVEST reservation
// ============================================================

describe('executeReservations — HARVEST', () => {
  it('harvests from nearest resource node', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 } });
    const world = makeWorld({
      characters: [ch],
      resourceNodes: [{
        id: 'rn-001',
        position: { x: 10.5, y: 10 },
        type: 'OreNode',
        remaining: 50,
        createdAt: 0,
      }],
    });
    const forces = createForceMap();

    const reservation: HarvestReservation = { op: 'HARVEST', slotIndex: 0, targetLocalId: 0 };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], new Map(), forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'HARVEST', success: true });
    const updated = result.world.characters.find(c => c.id === 'c-001')!;
    expect(updated.inventory['Ore']).toBe(1);

    // Resource node should have remaining decremented
    const node = result.world.resourceNodes.find(n => n.id === 'rn-001');
    expect(node!.remaining).toBe(49);
  });

  it('HARVEST fails when no resource node in range', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 } });
    const world = makeWorld({
      characters: [ch],
      resourceNodes: [{
        id: 'rn-001',
        position: { x: 100, y: 100 },
        type: 'OreNode',
        remaining: 50,
        createdAt: 0,
      }],
    });
    const forces = createForceMap();

    const reservation: HarvestReservation = { op: 'HARVEST', slotIndex: 0, targetLocalId: 0 };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], new Map(), forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'HARVEST', success: false });
  });
});

// ============================================================
// Tests: targeted HARVEST reservation
// ============================================================

describe('executeReservations — targeted HARVEST', () => {
  it('harvests specific resource node by local ID', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 } });
    const world = makeWorld({
      characters: [ch],
      resourceNodes: [
        {
          id: 'rn-ore',
          position: { x: 10.5, y: 10 },
          type: 'OreNode',
          remaining: 50,
          createdAt: 0,
        },
        {
          id: 'rn-crystal',
          position: { x: 10.3, y: 10 },  // closer than Ore
          type: 'CrystalNode',
          remaining: 50,
          createdAt: 0,
        },
      ],
    });
    const forces = createForceMap();
    // Map local ID 5 to the Ore node
    const localIdTable = new Map<number, string>([[5, 'rn-ore']]);

    const reservation: HarvestReservation = {
      op: 'HARVEST', slotIndex: 0, targetLocalId: 5,
    };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], localIdTable, forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'HARVEST', success: true });
    const updated = result.world.characters.find(c => c.id === 'c-001')!;
    // Should have Ore (targeted), not Crystal (nearest)
    expect(updated.inventory['Ore']).toBe(1);
    expect(updated.inventory['Crystal']).toBeUndefined();

    // Ore node depleted
    const oreNode = result.world.resourceNodes.find(n => n.id === 'rn-ore');
    expect(oreNode!.remaining).toBe(49);
    // Crystal node untouched
    const crystalNode = result.world.resourceNodes.find(n => n.id === 'rn-crystal');
    expect(crystalNode!.remaining).toBe(50);
  });

  it('targeted HARVEST fails when local ID not in table', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 } });
    const world = makeWorld({
      characters: [ch],
      resourceNodes: [{
        id: 'rn-001',
        position: { x: 10.5, y: 10 },
        type: 'OreNode',
        remaining: 50,
        createdAt: 0,
      }],
    });
    const forces = createForceMap();

    const reservation: HarvestReservation = {
      op: 'HARVEST', slotIndex: 0, targetLocalId: 99,
    };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], new Map(), forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'HARVEST', success: false });
  });

  it('targeted HARVEST fails when node is out of range', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 } });
    const world = makeWorld({
      characters: [ch],
      resourceNodes: [{
        id: 'rn-far',
        position: { x: 100, y: 100 },
        type: 'OreNode',
        remaining: 50,
        createdAt: 0,
      }],
    });
    const forces = createForceMap();
    const localIdTable = new Map<number, string>([[1, 'rn-far']]);

    const reservation: HarvestReservation = {
      op: 'HARVEST', slotIndex: 0, targetLocalId: 1,
    };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], localIdTable, forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'HARVEST', success: false });
  });

  it('targetLocalId=0 harvests nearest (Crystal closer than Ore)', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 } });
    const world = makeWorld({
      characters: [ch],
      resourceNodes: [
        {
          id: 'rn-ore',
          position: { x: 10.5, y: 10 },
          type: 'OreNode',
          remaining: 50,
          createdAt: 0,
        },
        {
          id: 'rn-crystal',
          position: { x: 10.3, y: 10 },  // closer
          type: 'CrystalNode',
          remaining: 50,
          createdAt: 0,
        },
      ],
    });
    const forces = createForceMap();

    const reservation: HarvestReservation = {
      op: 'HARVEST', slotIndex: 0, targetLocalId: 0,
    };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], new Map(), forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'HARVEST', success: true });
    const updated = result.world.characters.find(c => c.id === 'c-001')!;
    // Nearest is Crystal
    expect(updated.inventory['Crystal']).toBe(1);
    expect(updated.inventory['Ore']).toBeUndefined();
  });
});

// ============================================================
// Tests: targeted RECHARGE reservation
// ============================================================

describe('executeReservations — targeted RECHARGE', () => {
  it('recharges from specific energy node by local ID', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 }, energy: 100 });
    const world = makeWorld({
      characters: [ch],
      energyNodes: [
        {
          id: 'en-close',
          position: { x: 10.2, y: 10 },  // closer
          productionRate: 100,
          stored: 50,
          maxStored: 1000,
          createdAt: 0,
        },
        {
          id: 'en-target',
          position: { x: 10.5, y: 10 },
          productionRate: 100,
          stored: 500,
          maxStored: 1000,
          createdAt: 0,
        },
      ],
    });
    const forces = createForceMap();
    const localIdTable = new Map<number, string>([[3, 'en-target']]);

    const reservation: RechargeReservation = {
      op: 'RECHARGE', slotIndex: 0, targetLocalId: 3,
    };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], localIdTable, forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'RECHARGE', success: true });
    // The targeted node (en-target with stored=500) should be drained
    const targetNode = result.world.energyNodes.find(n => n.id === 'en-target')!;
    const gained = Math.min(params.rechargeAmount, 500);
    expect(targetNode.stored).toBe(500 - gained);
    // The closer node should be untouched
    const closeNode = result.world.energyNodes.find(n => n.id === 'en-close')!;
    expect(closeNode.stored).toBe(50);
  });
});

// ============================================================
// Tests: RECHARGE reservation
// ============================================================

describe('executeReservations — RECHARGE', () => {
  it('recharges from nearest energy node', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 }, energy: 100 });
    const world = makeWorld({
      characters: [ch],
      energyNodes: [{
        id: 'en-001',
        position: { x: 10.5, y: 10 },
        productionRate: 100,
        stored: 500,
        maxStored: 1000,
        createdAt: 0,
      }],
    });
    const forces = createForceMap();

    const reservation: RechargeReservation = { op: 'RECHARGE', slotIndex: 0, targetLocalId: 0 };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], new Map(), forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'RECHARGE', success: true });
    const updated = result.world.characters.find(c => c.id === 'c-001')!;
    // Energy gained = min(rechargeAmount, stored) = min(1000, 500) = 500
    // Then cost deducted: 100 + 500 - RECHARGE_COST(5)
    const gained = Math.min(params.rechargeAmount, 500);
    const expectedEnergy = 100 + gained - params.energyCosts['RECHARGE'];
    expect(updated.energy).toBe(expectedEnergy);

    // Energy node should have stored reduced
    const node = result.world.energyNodes.find(n => n.id === 'en-001')!;
    expect(node.stored).toBe(500 - gained);
  });

  it('RECHARGE fails when no energy node in range', () => {
    const ch = makeCharacter({ position: { x: 10, y: 10 } });
    const world = makeWorld({
      characters: [ch],
      energyNodes: [{
        id: 'en-001',
        position: { x: 100, y: 100 },
        productionRate: 100,
        stored: 500,
        maxStored: 1000,
        createdAt: 0,
      }],
    });
    const forces = createForceMap();

    const reservation: RechargeReservation = { op: 'RECHARGE', slotIndex: 0, targetLocalId: 0 };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], new Map(), forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'RECHARGE', success: false });
  });
});

// ============================================================
// Tests: WRITE reservation
// ============================================================

describe('executeReservations — WRITE', () => {
  it('copies memory block from source to target character', () => {
    const srcMemory = new Array(1024).fill(0);
    srcMemory[0] = 111;
    srcMemory[1] = 222;
    srcMemory[2] = 333;

    const parent = makeCharacter({
      id: 'c-001',
      position: { x: 10, y: 10 },
      energy: 5000,
      vm: {
        memory: srcMemory,
        registers: [0, 0, 0, 0, 0, 0, 0, 0],
        pc: 0,
        active: true,
        localIdTable: new Map(),
        localIdCounter: 0,
      },
    });

    const targetComponents: readonly ComponentType[] = [
      'Frame', 'Actuator', 'Sensor', 'Processor',
      'Harvester', 'Assembler', 'Charger', 'MemoryCore',
    ];
    const child = characterEngine.createInactiveCharacter(
      'c-002', { x: 10.5, y: 10 }, targetComponents, 500, 'testSpecies', 0,
    );

    const world = makeWorld({ characters: [parent, child] });
    const forces = createForceMap();
    const localIdTable = new Map<number, string>([[1, 'c-002']]);

    const reservation: WriteReservation = {
      op: 'WRITE',
      slotIndex: 0,
      targetLocalId: 1,
      srcAddr: 0,
      dstAddr: 0,
      length: 3,
    };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], localIdTable, forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'WRITE', success: true });

    const updatedChild = result.world.characters.find(c => c.id === 'c-002')!;
    expect(updatedChild.vm.memory[0]).toBe(111);
    expect(updatedChild.vm.memory[1]).toBe(222);
    expect(updatedChild.vm.memory[2]).toBe(333);
  });

  it('WRITE fails when target is out of range', () => {
    const parent = makeCharacter({ position: { x: 10, y: 10 }, energy: 5000 });
    const child = characterEngine.createInactiveCharacter(
      'c-002', { x: 100, y: 100 }, BASE_COMPONENTS, 500, 'testSpecies', 0,
    );

    const world = makeWorld({ characters: [parent, child] });
    const forces = createForceMap();
    const localIdTable = new Map<number, string>([[1, 'c-002']]);

    const reservation: WriteReservation = {
      op: 'WRITE',
      slotIndex: 0,
      targetLocalId: 1,
      srcAddr: 0,
      dstAddr: 0,
      length: 3,
    };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], localIdTable, forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'WRITE', success: false });
  });
});

// ============================================================
// Tests: ASSEMBLE reservation
// ============================================================

describe('executeReservations — ASSEMBLE', () => {
  it('assembles a new character from inventory components', () => {
    const ch = makeCharacter({
      energy: 5000,
      inventory: { Frame: 1, Actuator: 1, MemoryCore: 1 },
    });
    const world = makeWorld({ characters: [ch] });
    const forces = createForceMap();
    const localIdTable = new Map<number, string>();

    const reservation: AssembleReservation = {
      op: 'ASSEMBLE',
      slotIndex: 0,
      components: ['Frame', 'Actuator', 'MemoryCore'],
      childLocalId: 1,
    };
    localIdTable.set(1, '__pending_child_1');

    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], localIdTable, forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'ASSEMBLE', success: true });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('character_spawned');

    // Parent inventory should have components removed
    const updatedParent = result.world.characters.find(c => c.id === 'c-001')!;
    expect(updatedParent.inventory['Frame']).toBeUndefined();
    expect(updatedParent.inventory['Actuator']).toBeUndefined();
    expect(updatedParent.inventory['MemoryCore']).toBeUndefined();

    // A new character should exist
    expect(result.world.characters).toHaveLength(2);
    const child = result.world.characters.find(c => c.id !== 'c-001')!;
    expect(child.components).toContain('Frame');
    expect(child.components).toContain('Actuator');
    expect(child.components).toContain('MemoryCore');
    expect(child.vm.active).toBe(false);

    // Local ID table should be updated with actual child ID
    expect(result.updatedLocalIdTable.get(1)).toBe(child.id);
  });

  it('ASSEMBLE fails when inventory lacks components', () => {
    const ch = makeCharacter({ energy: 5000, inventory: {} });
    const world = makeWorld({ characters: [ch] });
    const forces = createForceMap();
    const localIdTable = new Map<number, string>();

    const reservation: AssembleReservation = {
      op: 'ASSEMBLE',
      slotIndex: 0,
      components: ['Frame', 'Actuator', 'MemoryCore'],
      childLocalId: 1,
    };

    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], localIdTable, forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'ASSEMBLE', success: false });
    expect(result.world.characters).toHaveLength(1);
  });
});

// ============================================================
// Tests: failure penalty
// ============================================================

describe('executeReservations — failure penalty', () => {
  it('deducts failure penalty on failed action', () => {
    // No Harvester component but trying to HARVEST
    const ch = characterEngine.createCharacter(
      'c-001', { x: 10, y: 10 },
      ['Frame', 'Actuator', 'Sensor', 'Processor', 'Assembler', 'Charger', 'MemoryCore'],
      [0], 5000, 'testSpecies', 0,
    );
    const world = makeWorld({ characters: [ch] });
    const forces = createForceMap();

    const reservation: HarvestReservation = { op: 'HARVEST', slotIndex: 0, targetLocalId: 0 };
    const result = actionEngine.executeReservations(
      world, 'c-001', [reservation], new Map(), forces,
    );

    expect(result.records[0]).toMatchObject({ op: 'HARVEST', success: false });
    const updated = result.world.characters.find(c => c.id === 'c-001')!;
    const failPenalty = Math.ceil(params.energyCosts['HARVEST'] * params.actionFailureCostRatio);
    expect(updated.energy).toBe(5000 - failPenalty);
  });
});
