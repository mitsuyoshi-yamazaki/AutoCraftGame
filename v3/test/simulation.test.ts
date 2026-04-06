import { describe, it, expect } from 'vitest';
import type { Character, World, Program } from '../src/types.js';
import { createEngine } from '../src/engine.js';
import { DEFAULT_GAME_PARAMS } from '../src/params.js';
import { createGroundGrid } from '../src/ground.js';
import { createCharacterEngine } from '../src/character.js';

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
    createdAt: 0,
  };
}

function makeWorld(chars: Character[]): World {
  return {
    width: 20,
    height: 20,
    resourceNodes: [],
    energyNodes: [
      { id: 'e1', position: { x: 10, y: 10 }, productionRate: 150, stored: 3000, maxStored: 3000, createdAt: 0 },
    ],
    remains: [],
    characters: chars,
    groundGrid: createGroundGrid(20, 20),
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
    const result = executeTick({ ...world, energyNodes: [{ id: 'e1', position: { x: 10, y: 10 }, productionRate: 100, stored: 500, maxStored: 3000, createdAt: 0 }] });
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

describe('aging metabolism', () => {
  const charEngine = createCharacterEngine(DEFAULT_GAME_PARAMS);
  // Default: agingThresholdN=3000, agingThresholdM=6000
  // Base component metabolism for 8 components: 1+2+2+3+2+3+2+1 = 16

  it('coefficient is 1.0 when age <= N', () => {
    expect(charEngine.calculateAgingCoefficient(0)).toBe(1.0);
    expect(charEngine.calculateAgingCoefficient(3000)).toBe(1.0);
  });

  it('coefficient is 2.0 when age = M', () => {
    expect(charEngine.calculateAgingCoefficient(6000)).toBe(2.0);
  });

  it('coefficient increases quadratically beyond N', () => {
    // age=4500: ratio = (4500-3000)/3000 = 0.5, coeff = 1 + 0.25 = 1.25
    expect(charEngine.calculateAgingCoefficient(4500)).toBe(1.25);
    // age=9000: ratio = (9000-3000)/3000 = 2.0, coeff = 1 + 4 = 5.0
    expect(charEngine.calculateAgingCoefficient(9000)).toBe(5.0);
  });

  it('metabolism is unchanged for young characters', () => {
    const char = makeChar('c1', 5, 5);
    // createdAt=0, tick=0 → age=0, coefficient=1.0
    expect(charEngine.calculateBasalMetabolism(char, 0)).toBe(16);
    // createdAt=0, tick=3000 → age=3000, coefficient=1.0
    expect(charEngine.calculateBasalMetabolism(char, 3000)).toBe(16);
  });

  it('metabolism doubles at age M', () => {
    const char = makeChar('c1', 5, 5);
    // createdAt=0, tick=6000 → age=6000, coefficient=2.0
    // ceil(16 * 2.0) = 32
    expect(charEngine.calculateBasalMetabolism(char, 6000)).toBe(32);
  });

  it('metabolism increases significantly beyond M', () => {
    const char = makeChar('c1', 5, 5);
    // age=9000: coefficient=5.0, ceil(16*5) = 80
    expect(charEngine.calculateBasalMetabolism(char, 9000)).toBe(80);
  });

  it('aging only affects component metabolism, not inventory', () => {
    const char = { ...makeChar('c1', 5, 5), inventory: { Ore: 4 } };
    // age=6000: component=ceil(16*2)=32, inventory=4*1=4, total=36
    expect(charEngine.calculateBasalMetabolism(char, 6000)).toBe(36);
    // age=0: component=16, inventory=4, total=20
    expect(charEngine.calculateBasalMetabolism(char, 0)).toBe(20);
  });

  it('createdAt offsets the age correctly', () => {
    const char = { ...makeChar('c1', 5, 5), createdAt: 1000 };
    // tick=1000 → age=0, coefficient=1.0
    expect(charEngine.calculateBasalMetabolism(char, 1000)).toBe(16);
    // tick=4000 → age=3000, coefficient=1.0
    expect(charEngine.calculateBasalMetabolism(char, 4000)).toBe(16);
    // tick=7000 → age=6000, coefficient=2.0
    expect(charEngine.calculateBasalMetabolism(char, 7000)).toBe(32);
  });

  it('aging metabolism is applied during simulation tick', () => {
    // Character created at tick 0, simulate at tick 6000 (age=6000, coeff=2.0)
    const char = makeChar('c1', 5, 5);
    const world = { ...makeWorld([char]), tick: 6000 };
    const result = executeTick(world);
    const c = result.world.characters.find((c) => c.id === 'c1')!;
    // ceil(16 * 2.0) = 32
    expect(c.energy).toBe(5000 - 32);
  });
});
