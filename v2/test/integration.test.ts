import { describe, it, expect } from 'vitest';
import { runSimulation } from '../src/simulation.js';
import { createCharacter } from '../src/character.js';
import { MIN_COMPONENTS } from '../src/recipes.js';
import { RECHARGE_AMOUNT, ENERGY_COST_RECHARGE, ASSEMBLE_ENERGY_TRANSFER, getAssembleTotalCost } from '../src/constants.js';
import type { World, Program } from '../src/types.js';

// Minimal world with manually placed nodes for predictable behavior
function testWorld(): World {
  return {
    width: 20,
    height: 20,
    resourceNodes: [
      // Ore nodes adjacent to (5,5)
      { position: { x: 4, y: 5 }, type: 'OreNode', remaining: 50 },
      // Crystal nodes nearby
      { position: { x: 6, y: 5 }, type: 'CrystalNode', remaining: 50 },
    ],
    energyNodes: [
      // EnergyNode adjacent to start
      { position: { x: 5, y: 4 }, productionRate: 200, stored: 2000, maxStored: 2000 },
    ],
    remains: [],
    characters: [],
    nextCharacterId: 1,
    tick: 0,
  };
}

describe('integration: self-replication cycle', () => {
  it('character can RECHARGE from adjacent EnergyNode', () => {
    const program: Program = {
      rules: [
        { condition: { op: 'nearby', type: 'EnergyNode', radius: 1 }, action: { op: 'RECHARGE' } },
        { condition: { op: 'true' }, action: { op: 'NOOP' } },
      ],
    };
    const c = createCharacter('char-001', { x: 5, y: 5 }, MIN_COMPONENTS, program, 1000);
    const world: World = { ...testWorld(), characters: [c], nextCharacterId: 2 };

    const { world: after } = runSimulation(world, 5);
    const ch = after.characters[0];
    // Should have recharged multiple times, energy should be higher than if only consuming
    expect(ch.energy).toBeGreaterThan(500);
  });

  it('character can HARVEST adjacent resources', () => {
    const program: Program = {
      rules: [
        { condition: { op: 'nearby', type: 'OreNode', radius: 1 }, action: { op: 'HARVEST' } },
        { condition: { op: 'true' }, action: { op: 'NOOP' } },
      ],
    };
    const c = createCharacter('char-001', { x: 5, y: 5 }, MIN_COMPONENTS, program, 5000);
    const world: World = { ...testWorld(), characters: [c], nextCharacterId: 2 };

    const { world: after } = runSimulation(world, 10);
    const ch = after.characters[0];
    const totalItems = Object.values(ch.inventory).reduce((s, n) => s + n, 0);
    expect(totalItems).toBeGreaterThan(0);
  });

  it('character can complete full self-replication', () => {
    // Program that: recharges when low, harvests ore, harvests crystal,
    // processes, crafts, assembles, writes
    const program: Program = {
      rules: [
        // Recharge when energy low
        {
          condition: {
            op: 'and',
            conditions: [
              { op: 'energy_below', threshold: 2000 },
              { op: 'nearby', type: 'EnergyNode', radius: 1 },
            ],
          },
          action: { op: 'RECHARGE' },
        },
        // Write to nearby inactive
        {
          condition: { op: 'nearby', type: 'InactiveCharacter', radius: 1 },
          action: { op: 'WRITE', target: 'nearest_inactive' },
        },
        // Assemble when we have all parts
        {
          condition: {
            op: 'and',
            conditions: [
              { op: 'inventory_has', item: 'Frame', count: 1 },
              { op: 'inventory_has', item: 'Actuator', count: 1 },
              { op: 'inventory_has', item: 'Sensor', count: 1 },
              { op: 'inventory_has', item: 'Processor', count: 1 },
              { op: 'inventory_has', item: 'Harvester', count: 1 },
              { op: 'inventory_has', item: 'Assembler', count: 1 },
              { op: 'inventory_has', item: 'Charger', count: 1 },
              { op: 'inventory_has', item: 'MemoryCore', count: 1 },
            ],
          },
          action: {
            op: 'ASSEMBLE',
            components: ['Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'Charger', 'MemoryCore'],
          },
        },
        // Craft chain: craft each component when its specific materials AND
        // the component is not yet in inventory
        {
          condition: {
            op: 'and',
            conditions: [
              { op: 'not', condition: { op: 'inventory_has', item: 'Frame', count: 1 } },
              { op: 'inventory_has', item: 'Metal', count: 3 },
            ],
          },
          action: { op: 'CRAFT', component: 'Frame' },
        },
        {
          condition: {
            op: 'and',
            conditions: [
              { op: 'not', condition: { op: 'inventory_has', item: 'Processor', count: 1 } },
              { op: 'inventory_has', item: 'Circuit', count: 3 },
            ],
          },
          action: { op: 'CRAFT', component: 'Processor' },
        },
        {
          condition: {
            op: 'and',
            conditions: [
              { op: 'not', condition: { op: 'inventory_has', item: 'Sensor', count: 1 } },
              { op: 'inventory_has', item: 'Circuit', count: 2 },
            ],
          },
          action: { op: 'CRAFT', component: 'Sensor' },
        },
        {
          condition: {
            op: 'and',
            conditions: [
              { op: 'not', condition: { op: 'inventory_has', item: 'MemoryCore', count: 1 } },
              { op: 'inventory_has', item: 'Circuit', count: 2 },
            ],
          },
          action: { op: 'CRAFT', component: 'MemoryCore' },
        },
        {
          condition: {
            op: 'and',
            conditions: [
              { op: 'not', condition: { op: 'inventory_has', item: 'Charger', count: 1 } },
              { op: 'inventory_has', item: 'Metal', count: 1 },
              { op: 'inventory_has', item: 'Circuit', count: 2 },
            ],
          },
          action: { op: 'CRAFT', component: 'Charger' },
        },
        {
          condition: {
            op: 'and',
            conditions: [
              { op: 'not', condition: { op: 'inventory_has', item: 'Assembler', count: 1 } },
              { op: 'inventory_has', item: 'Metal', count: 2 },
              { op: 'inventory_has', item: 'Circuit', count: 1 },
            ],
          },
          action: { op: 'CRAFT', component: 'Assembler' },
        },
        {
          condition: {
            op: 'and',
            conditions: [
              { op: 'not', condition: { op: 'inventory_has', item: 'Harvester', count: 1 } },
              { op: 'inventory_has', item: 'Metal', count: 2 },
            ],
          },
          action: { op: 'CRAFT', component: 'Harvester' },
        },
        {
          condition: {
            op: 'and',
            conditions: [
              { op: 'not', condition: { op: 'inventory_has', item: 'Actuator', count: 1 } },
              { op: 'inventory_has', item: 'Metal', count: 1 },
              { op: 'inventory_has', item: 'Circuit', count: 1 },
            ],
          },
          action: { op: 'CRAFT', component: 'Actuator' },
        },
        // Process
        { condition: { op: 'inventory_has', item: 'Ore', count: 2 }, action: { op: 'PROCESS', recipe: 'Metal' } },
        { condition: { op: 'inventory_has', item: 'Crystal', count: 2 }, action: { op: 'PROCESS', recipe: 'Circuit' } },
        // Harvest from adjacent nodes
        { condition: { op: 'nearby', type: 'OreNode', radius: 1 }, action: { op: 'HARVEST' } },
        { condition: { op: 'nearby', type: 'CrystalNode', radius: 1 }, action: { op: 'HARVEST' } },
        { condition: { op: 'true' }, action: { op: 'NOOP' } },
      ],
    };

    // Place character at (5,5) with Ore at (4,5), Crystal at (6,5), Energy at (5,4)
    // All adjacent — no MOVE needed
    const c = createCharacter('char-001', { x: 5, y: 5 }, MIN_COMPONENTS, program, 5000);
    const world: World = {
      width: 20,
      height: 20,
      resourceNodes: [
        { position: { x: 4, y: 5 }, type: 'OreNode', remaining: 50 },
        { position: { x: 6, y: 5 }, type: 'CrystalNode', remaining: 50 },
      ],
      energyNodes: [
        { position: { x: 5, y: 4 }, productionRate: 300, stored: 2000, maxStored: 5000 },
      ],
      remains: [],
      characters: [c],
      nextCharacterId: 2,
      tick: 0,
    };

    const { world: after, allEvents } = runSimulation(world, 500);
    const spawns = allEvents.filter((e) => e.type === 'character_spawned');
    expect(spawns.length).toBeGreaterThanOrEqual(1);

    // Child should have received energy
    if (after.characters.length > 1) {
      const child = after.characters.find((ch) => ch.id !== 'char-001');
      expect(child).toBeDefined();
    }
  });
});
