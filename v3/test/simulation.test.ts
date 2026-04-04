import { describe, it, expect } from 'vitest';
import type { Character, World, Program } from '../src/types.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';

const engine = createEngine(DEFAULT_GAME_PARAMS);
const { executeTick, runSimulation } = engine;

function makeChar(id: string, x: number, y: number, program: Program | null = null): Character {
  return {
    id,
    species: 'test',
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    components: ['Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'Charger', 'MemoryCore'],
    inventory: {},
    durability: 300,
    energy: 5000,
    program,
    senseData: null,
    registers: [],
  };
}

function makeWorld(chars: Character[]): World {
  return {
    width: 20,
    height: 20,
    resourceNodes: [],
    energyNodes: [
      { id: 'e1', position: { x: 10, y: 10 }, productionRate: 150, stored: 3000, maxStored: 3000 },
    ],
    remains: [],
    characters: chars,
    nextCharacterId: chars.length + 1,
    nextObjectId: 100,
    tick: 0,
  };
}

describe('simulation', () => {
  it('increments tick', () => {
    const world = makeWorld([makeChar('c1', 5, 5)]);
    const result = executeTick(world);
    expect(result.world.tick).toBe(1);
  });

  it('produces energy each tick', () => {
    const world = makeWorld([]);
    const result = executeTick({ ...world, energyNodes: [{ id: 'e1', position: { x: 10, y: 10 }, productionRate: 100, stored: 500, maxStored: 3000 }] });
    expect(result.world.energyNodes[0].stored).toBe(600);
  });

  it('applies durability decay', () => {
    const char = makeChar('c1', 5, 5);
    const world = makeWorld([char]);
    const result = executeTick(world);
    const c = result.world.characters.find((c) => c.id === 'c1')!;
    expect(c.durability).toBe(299);
  });

  it('applies basal metabolism', () => {
    const char = makeChar('c1', 5, 5);
    const world = makeWorld([char]);
    const result = executeTick(world);
    const c = result.world.characters.find((c) => c.id === 'c1')!;
    // MIN_COMPONENTS metabolism: 1+2+2+3+2+3+2+1 = 16 per tick
    expect(c.energy).toBe(5000 - 16);
  });

  it('character dies when durability reaches 0', () => {
    const char = { ...makeChar('c1', 5, 5), durability: 1 };
    const world = makeWorld([char]);
    const result = executeTick(world);
    expect(result.world.characters.length).toBe(0);
    expect(result.world.remains.length).toBe(1);
    expect(result.events).toContainEqual({ type: 'character_died', id: 'c1' });
  });

  it('MOVE applies physics to update position', () => {
    const program: Program = {
      rules: [{ condition: { op: 'true' }, action: { op: 'MOVE', direction: 0 } }],
    };
    const char = makeChar('c1', 5, 5, program);
    const world = { ...makeWorld([char]), energyNodes: [] };
    const result = executeTick(world);
    const c = result.world.characters.find((c) => c.id === 'c1')!;
    expect(c.position.x).toBeGreaterThan(5);
  });

  it('runSimulation stops when all characters die', () => {
    const char = { ...makeChar('c1', 5, 5), durability: 3 };
    const world = makeWorld([char]);
    const { world: finalWorld } = runSimulation(world, 100);
    expect(finalWorld.characters.length).toBe(0);
    expect(finalWorld.tick).toBeLessThan(100);
  });
});
