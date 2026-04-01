import { describe, it, expect } from 'vitest';
import { executeAction } from '../src/actions.js';
import { createCharacter, createInactiveCharacter } from '../src/character.js';
import type { World, Character, Program } from '../src/types.js';
import {
  ENERGY_COST_MOVE,
  ENERGY_COST_HARVEST,
  ENERGY_COST_RECHARGE,
  ENERGY_COST_PROCESS,
  ENERGY_COST_CRAFT,
  ENERGY_COST_DISASSEMBLE,
  RECHARGE_AMOUNT,
  ASSEMBLE_ENERGY_TRANSFER,
  getAssembleTotalCost,
  getFailurePenalty,
} from '../src/constants.js';
import { addRemains, createRemains, addCharacter } from '../src/world.js';

const program: Program = { rules: [] };

function baseWorld(): World {
  return {
    width: 10, height: 10,
    resourceNodes: [], energyNodes: [], remains: [],
    characters: [], nextCharacterId: 2, tick: 0,
  };
}

function worldWithChar(c: Character): World {
  return { ...baseWorld(), characters: [c] };
}

describe('actions', () => {
  describe('energy checks', () => {
    it('MOVE fails without energy (no consumption)', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Actuator'], program, 0);
      const world = worldWithChar(c);
      const result = executeAction(world, 'c1', { op: 'MOVE', direction: 'N' });
      expect(result.success).toBe(false);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      expect(after.energy).toBe(0);
    });

    it('MOVE succeeds and consumes energy', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Actuator'], program, 1000);
      const world = worldWithChar(c);
      const result = executeAction(world, 'c1', { op: 'MOVE', direction: 'N' });
      expect(result.success).toBe(true);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      expect(after.energy).toBe(1000 - ENERGY_COST_MOVE);
      expect(after.position).toEqual({ x: 5, y: 4 });
    });

    it('MOVE to occupied tile fails with penalty', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Actuator'], program, 1000);
      const c2 = createCharacter('c2', { x: 5, y: 4 }, ['Frame'], program, 1000);
      const world = { ...baseWorld(), characters: [c, c2] };
      const result = executeAction(world, 'c1', { op: 'MOVE', direction: 'N' });
      expect(result.success).toBe(false);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      expect(after.energy).toBe(1000 - getFailurePenalty(ENERGY_COST_MOVE));
    });
  });

  describe('HARVEST', () => {
    it('harvests from adjacent ResourceNode', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Harvester'], program, 1000);
      const world: World = {
        ...worldWithChar(c),
        resourceNodes: [{ position: { x: 5, y: 4 }, type: 'OreNode', remaining: 10 }],
      };
      const result = executeAction(world, 'c1', { op: 'HARVEST' });
      expect(result.success).toBe(true);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      expect(after.inventory.Ore).toBe(1);
      expect(after.energy).toBe(1000 - ENERGY_COST_HARVEST);
      expect(result.world.resourceNodes[0].remaining).toBe(9);
    });

    it('fails when no adjacent node (penalty)', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Harvester'], program, 1000);
      const world = worldWithChar(c);
      const result = executeAction(world, 'c1', { op: 'HARVEST' });
      expect(result.success).toBe(false);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      expect(after.energy).toBe(1000 - getFailurePenalty(ENERGY_COST_HARVEST));
    });
  });

  describe('RECHARGE', () => {
    it('recharges from adjacent EnergyNode', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Charger'], program, 1000);
      const world: World = {
        ...worldWithChar(c),
        energyNodes: [{ position: { x: 5, y: 4 }, productionRate: 100, stored: 800, maxStored: 2000 }],
      };
      const result = executeAction(world, 'c1', { op: 'RECHARGE' });
      expect(result.success).toBe(true);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      expect(after.energy).toBe(1000 + RECHARGE_AMOUNT - ENERGY_COST_RECHARGE);
      expect(result.world.energyNodes[0].stored).toBe(800 - RECHARGE_AMOUNT);
    });

    it('recharges partial amount when node has less', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Charger'], program, 1000);
      const world: World = {
        ...worldWithChar(c),
        energyNodes: [{ position: { x: 5, y: 4 }, productionRate: 100, stored: 200, maxStored: 2000 }],
      };
      const result = executeAction(world, 'c1', { op: 'RECHARGE' });
      expect(result.success).toBe(true);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      expect(after.energy).toBe(1000 + 200 - ENERGY_COST_RECHARGE);
    });
  });

  describe('DISASSEMBLE', () => {
    it('takes raw material from remains inventory as-is', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Disassembler'], program, 1000);
      const remains = createRemains({ x: 5, y: 4 }, [], { Ore: 3, Crystal: 1 });
      const world: World = { ...worldWithChar(c), remains: [remains] };
      const result = executeAction(world, 'c1', { op: 'DISASSEMBLE' });
      expect(result.success).toBe(true);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      // Alphabetical: Crystal before Ore
      expect(after.inventory.Crystal).toBe(1);
    });

    it('decomposes component in inventory to craft recipe inputs', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Disassembler'], program, 1000);
      const remains = createRemains({ x: 5, y: 4 }, [], { Frame: 1 });
      const world: World = { ...worldWithChar(c), remains: [remains] };
      const result = executeAction(world, 'c1', { op: 'DISASSEMBLE' });
      expect(result.success).toBe(true);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      // Frame recipe = Metal x3, so inventory gets Metal 3
      expect(after.inventory.Metal).toBe(3);
      expect(after.inventory.Frame).toBeUndefined();
    });

    it('decomposes body component to craft recipe inputs', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Disassembler'], program, 1000);
      const remains = createRemains({ x: 5, y: 4 }, ['Processor'], {});
      const world: World = { ...worldWithChar(c), remains: [remains] };
      const result = executeAction(world, 'c1', { op: 'DISASSEMBLE' });
      expect(result.success).toBe(true);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      // Processor recipe = Circuit x3
      expect(after.inventory.Circuit).toBe(3);
    });

    it('removes empty remains', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Disassembler'], program, 1000);
      const remains = createRemains({ x: 5, y: 4 }, [], { Ore: 1 });
      const world: World = { ...worldWithChar(c), remains: [remains] };
      const result = executeAction(world, 'c1', { op: 'DISASSEMBLE' });
      expect(result.world.remains.length).toBe(0);
    });
  });

  describe('ASSEMBLE', () => {
    it('transfers energy to child', () => {
      const components = ['Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'Charger', 'MemoryCore'] as const;
      const inv: Record<string, number> = {};
      for (const c of components) inv[c] = (inv[c] ?? 0) + 1;
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame', 'Assembler'], program, 10000);
      const charWithInv = { ...c, inventory: inv };
      const world: World = { ...baseWorld(), characters: [charWithInv] };

      const result = executeAction(world, 'c1', { op: 'ASSEMBLE', components: [...components] });
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);

      const parent = result.world.characters.find((ch) => ch.id === 'c1')!;
      expect(parent.energy).toBe(10000 - getAssembleTotalCost());

      const child = result.world.characters.find((ch) => ch.id !== 'c1')!;
      expect(child.energy).toBe(ASSEMBLE_ENERGY_TRANSFER);
      expect(child.program).toBeNull();
    });
  });

  describe('NOOP', () => {
    it('succeeds with zero energy cost', () => {
      const c = createCharacter('c1', { x: 5, y: 5 }, ['Frame'], program, 0);
      const world = worldWithChar(c);
      const result = executeAction(world, 'c1', { op: 'NOOP' });
      expect(result.success).toBe(true);
      const after = result.world.characters.find((ch) => ch.id === 'c1')!;
      expect(after.energy).toBe(0);
    });
  });
});
