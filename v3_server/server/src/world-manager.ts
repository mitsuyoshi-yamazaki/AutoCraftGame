import type { World, TickResult, SimulationEvent } from './simulation/types.js';
import type { GameParams } from './simulation/params.js';
import type { Engine } from './simulation/engine.js';
import { createEngine } from './simulation/engine.js';
import type { WorldConfig } from './simulation/world.js';
import { DEFAULT_WORLD_CONFIG, createRng } from './simulation/world.js';
import type { ProgramDef } from './initial-characters.js';
import { placeInitialCharacters } from './initial-characters.js';
import type { WorldStats, GameEvent, TickDelta, WorldSnapshot, CharacterDTO, ResourceNodeDTO, EnergyNodeDTO, RemainsDTO } from '../../shared/types.js';

// ============================================================
// ManagedWorld — a running world instance
// ============================================================
export interface ManagedWorld {
  id: string;
  name: string;
  status: 'running' | 'stopped';
  world: World;
  engine: Engine;
  params: GameParams;
  config: WorldConfig;
  seed: number;
  ticksPerSecond: number;
  totalBirths: number;
  totalDeaths: number;
  createdAt: string;
  lastActions: Map<string, string>;
  tickListeners: Set<(delta: TickDelta) => void>;
  previousState: PreviousState | null;
}

interface PreviousState {
  characters: Map<string, CharacterSnapshot>;
  resourceNodes: Map<string, ResourceNodeSnapshot>;
  energyNodes: Map<string, EnergyNodeSnapshot>;
  remainsIds: Set<string>;
  groundGrid: { ore: number; crystal: number }[];
}

interface CharacterSnapshot {
  position_x: number;
  position_y: number;
  velocity_vx: number;
  velocity_vy: number;
  durability: number;
  energy: number;
  inventoryHash: string;
}

interface ResourceNodeSnapshot {
  remaining: number;
}

interface EnergyNodeSnapshot {
  stored: number;
}

// ============================================================
// WorldManager
// ============================================================
export class WorldManager {
  private worlds = new Map<string, ManagedWorld>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  getWorld(id: string): ManagedWorld | undefined {
    return this.worlds.get(id);
  }

  getAllWorlds(): ManagedWorld[] {
    return Array.from(this.worlds.values());
  }

  createWorld(options: {
    id: string;
    name: string;
    params: GameParams;
    config?: WorldConfig;
    seed?: number;
    ticksPerSecond?: number;
    programDefs?: ProgramDef[];
  }): ManagedWorld {
    if (this.worlds.has(options.id)) {
      throw new Error(`World ${options.id} already exists`);
    }

    const config = options.config ?? DEFAULT_WORLD_CONFIG;
    const seed = options.seed ?? Date.now();
    const tps = options.ticksPerSecond ?? 10;
    const engine = createEngine(options.params);
    const rng = createRng(seed);
    let world = engine.createWorld(config, rng);

    if (options.programDefs && options.programDefs.length > 0) {
      world = placeInitialCharacters(world, engine, options.programDefs, rng);
    }

    const managed: ManagedWorld = {
      id: options.id,
      name: options.name,
      status: 'stopped',
      world,
      engine,
      params: options.params,
      config,
      seed,
      ticksPerSecond: tps,
      totalBirths: 0,
      totalDeaths: 0,
      createdAt: new Date().toISOString(),
      lastActions: new Map(),
      tickListeners: new Set(),
      previousState: null,
    };

    this.worlds.set(options.id, managed);
    return managed;
  }

  loadWorld(options: {
    id: string;
    name: string;
    params: GameParams;
    config: WorldConfig;
    seed: number;
    world: World;
    totalBirths: number;
    totalDeaths: number;
    createdAt: string;
    ticksPerSecond?: number;
  }): ManagedWorld {
    if (this.worlds.has(options.id)) {
      throw new Error(`World ${options.id} already exists`);
    }

    const engine = createEngine(options.params);
    const managed: ManagedWorld = {
      id: options.id,
      name: options.name,
      status: 'stopped',
      world: options.world,
      engine,
      params: options.params,
      config: options.config,
      seed: options.seed,
      ticksPerSecond: options.ticksPerSecond ?? 10,
      totalBirths: options.totalBirths,
      totalDeaths: options.totalDeaths,
      createdAt: options.createdAt,
      lastActions: new Map(),
      tickListeners: new Set(),
      previousState: null,
    };

    this.worlds.set(options.id, managed);
    return managed;
  }

  startWorld(id: string): void {
    const managed = this.worlds.get(id);
    if (!managed) throw new Error(`World ${id} not found`);
    if (managed.status === 'running') return;

    managed.status = 'running';
    managed.previousState = captureState(managed.world);

    const interval = 1000 / managed.ticksPerSecond;
    const timer = setInterval(() => {
      this.tick(id);
    }, interval);
    this.timers.set(id, timer);
  }

  stopWorld(id: string): void {
    const managed = this.worlds.get(id);
    if (!managed) throw new Error(`World ${id} not found`);

    managed.status = 'stopped';
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }

    for (const listener of managed.tickListeners) {
      listener({
        tick: managed.world.tick,
        characters: { updated: [], added: [], removed: [] },
        resourceNodes: { updated: [], added: [], removed: [] },
        energyNodes: { updated: [], added: [], removed: [] },
        remains: { added: [], removed: [] },
        groundGrid: { updated: [] },
        events: [],
        stats: computeStats(managed),
      });
    }
  }

  deleteWorld(id: string): void {
    this.stopWorld(id);
    this.worlds.delete(id);
  }

  stopAll(): void {
    for (const id of this.worlds.keys()) {
      if (this.worlds.get(id)?.status === 'running') {
        this.stopWorld(id);
      }
    }
  }

  addTickListener(worldId: string, listener: (delta: TickDelta) => void): void {
    const managed = this.worlds.get(worldId);
    if (managed) managed.tickListeners.add(listener);
  }

  removeTickListener(worldId: string, listener: (delta: TickDelta) => void): void {
    const managed = this.worlds.get(worldId);
    if (managed) managed.tickListeners.delete(listener);
  }

  private tick(id: string): void {
    const managed = this.worlds.get(id);
    if (!managed || managed.status !== 'running') return;

    const result = managed.engine.executeTick(managed.world);
    managed.world = result.world;

    for (const event of result.events) {
      if (event.type === 'character_spawned') managed.totalBirths++;
      if (event.type === 'character_died') managed.totalDeaths++;
    }

    managed.lastActions = new Map(
      Array.from(result.actions.entries()).map(([k, v]) => [k, v.op]),
    );

    const delta = computeDelta(managed, result, managed.previousState);
    managed.previousState = captureState(managed.world);

    for (const listener of managed.tickListeners) {
      listener(delta);
    }
  }
}

// ============================================================
// Helpers
// ============================================================
export function computeStats(managed: ManagedWorld): WorldStats {
  const speciesCounts: Record<string, number> = {};
  for (const c of managed.world.characters) {
    speciesCounts[c.species] = (speciesCounts[c.species] ?? 0) + 1;
  }
  return {
    characterCount: managed.world.characters.length,
    totalBirths: managed.totalBirths,
    totalDeaths: managed.totalDeaths,
    resourceNodeCount: managed.world.resourceNodes.length,
    energyNodeCount: managed.world.energyNodes.length,
    remainsCount: managed.world.remains.length,
    speciesCounts,
  };
}

export function worldToSnapshot(managed: ManagedWorld): WorldSnapshot {
  return {
    tick: managed.world.tick,
    width: managed.world.width,
    height: managed.world.height,
    characters: managed.world.characters.map((c) => characterToDTO(c, managed.lastActions.get(c.id))),
    resourceNodes: managed.world.resourceNodes.map(resourceNodeToDTO),
    energyNodes: managed.world.energyNodes.map(energyNodeToDTO),
    remains: managed.world.remains.map(remainsToDTO),
    groundGrid: managed.world.groundGrid.map((cell) => ({ ore: cell.ore, crystal: cell.crystal })),
    stats: computeStats(managed),
  };
}

function characterToDTO(c: any, action?: string): CharacterDTO {
  return {
    id: c.id,
    species: c.species,
    position: { x: c.position.x, y: c.position.y },
    velocity: { vx: c.velocity.vx, vy: c.velocity.vy },
    components: [...c.components],
    inventory: { ...c.inventory },
    durability: c.durability,
    energy: c.energy,
    action,
    senseData: c.senseData,
    registers: [...c.registers],
    createdAt: c.createdAt,
  };
}

function resourceNodeToDTO(n: any): ResourceNodeDTO {
  return {
    id: n.id,
    position: { x: n.position.x, y: n.position.y },
    type: n.type,
    remaining: n.remaining,
    createdAt: n.createdAt,
  };
}

function energyNodeToDTO(n: any): EnergyNodeDTO {
  return {
    id: n.id,
    position: { x: n.position.x, y: n.position.y },
    productionRate: n.productionRate,
    stored: n.stored,
    maxStored: n.maxStored,
    createdAt: n.createdAt,
  };
}

function remainsToDTO(r: any): RemainsDTO {
  return {
    id: r.id,
    position: { x: r.position.x, y: r.position.y },
    components: [...r.components],
    inventory: { ...r.inventory },
    createdAt: r.createdAt,
  };
}

function inventoryHash(inv: Record<string, number>): string {
  return Object.entries(inv).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(',');
}

function captureState(world: World): PreviousState {
  const characters = new Map<string, CharacterSnapshot>();
  for (const c of world.characters) {
    characters.set(c.id, {
      position_x: c.position.x,
      position_y: c.position.y,
      velocity_vx: c.velocity.vx,
      velocity_vy: c.velocity.vy,
      durability: c.durability,
      energy: c.energy,
      inventoryHash: inventoryHash(c.inventory),
    });
  }

  const resourceNodes = new Map<string, ResourceNodeSnapshot>();
  for (const n of world.resourceNodes) {
    resourceNodes.set(n.id, { remaining: n.remaining });
  }

  const energyNodes = new Map<string, EnergyNodeSnapshot>();
  for (const n of world.energyNodes) {
    energyNodes.set(n.id, { stored: n.stored });
  }

  const remainsIds = new Set(world.remains.map((r) => r.id));

  const groundGrid = world.groundGrid.map((cell) => ({ ore: cell.ore, crystal: cell.crystal }));

  return { characters, resourceNodes, energyNodes, remainsIds, groundGrid };
}

function computeDelta(
  managed: ManagedWorld,
  result: TickResult,
  prev: PreviousState | null,
): TickDelta {
  const world = managed.world;
  const stats = computeStats(managed);

  if (!prev) {
    return {
      tick: world.tick,
      characters: {
        updated: [],
        added: world.characters.map((c) => characterToDTO(c, managed.lastActions.get(c.id))),
        removed: [],
      },
      resourceNodes: { updated: [], added: world.resourceNodes.map(resourceNodeToDTO), removed: [] },
      energyNodes: { updated: [], added: world.energyNodes.map(energyNodeToDTO), removed: [] },
      remains: { added: world.remains.map(remainsToDTO), removed: [] },
      groundGrid: { updated: [] },
      events: convertEvents(result.events, managed),
      stats,
    };
  }

  // Characters diff
  const charUpdated: CharacterDTO[] = [];
  const charAdded: CharacterDTO[] = [];
  const currentCharIds = new Set(world.characters.map((c) => c.id));
  const charRemoved: string[] = [];

  for (const c of world.characters) {
    const prevSnap = prev.characters.get(c.id);
    if (!prevSnap) {
      charAdded.push(characterToDTO(c, managed.lastActions.get(c.id)));
    } else {
      const changed =
        prevSnap.position_x !== c.position.x ||
        prevSnap.position_y !== c.position.y ||
        prevSnap.velocity_vx !== c.velocity.vx ||
        prevSnap.velocity_vy !== c.velocity.vy ||
        prevSnap.durability !== c.durability ||
        prevSnap.energy !== c.energy ||
        prevSnap.inventoryHash !== inventoryHash(c.inventory);
      if (changed) {
        charUpdated.push(characterToDTO(c, managed.lastActions.get(c.id)));
      }
    }
  }
  for (const prevId of prev.characters.keys()) {
    if (!currentCharIds.has(prevId)) charRemoved.push(prevId);
  }

  // ResourceNodes diff
  const rnUpdated: ResourceNodeDTO[] = [];
  const rnAdded: ResourceNodeDTO[] = [];
  const currentRnIds = new Set(world.resourceNodes.map((n) => n.id));
  const rnRemoved: string[] = [];

  for (const n of world.resourceNodes) {
    const prevSnap = prev.resourceNodes.get(n.id);
    if (!prevSnap) {
      rnAdded.push(resourceNodeToDTO(n));
    } else if (prevSnap.remaining !== n.remaining) {
      rnUpdated.push(resourceNodeToDTO(n));
    }
  }
  for (const prevId of prev.resourceNodes.keys()) {
    if (!currentRnIds.has(prevId)) rnRemoved.push(prevId);
  }

  // EnergyNodes diff
  const enUpdated: EnergyNodeDTO[] = [];
  const enAdded: EnergyNodeDTO[] = [];
  const currentEnIds = new Set(world.energyNodes.map((n) => n.id));
  const enRemoved: string[] = [];

  for (const n of world.energyNodes) {
    const prevSnap = prev.energyNodes.get(n.id);
    if (!prevSnap) {
      enAdded.push(energyNodeToDTO(n));
    } else if (prevSnap.stored !== n.stored) {
      enUpdated.push(energyNodeToDTO(n));
    }
  }
  for (const prevId of prev.energyNodes.keys()) {
    if (!currentEnIds.has(prevId)) enRemoved.push(prevId);
  }

  // Remains diff
  const currentRemIds = new Set(world.remains.map((r) => r.id));
  const remAdded = world.remains
    .filter((r) => !prev.remainsIds.has(r.id))
    .map(remainsToDTO);
  const remRemoved: string[] = [];
  for (const prevId of prev.remainsIds) {
    if (!currentRemIds.has(prevId)) remRemoved.push(prevId);
  }

  // GroundGrid diff
  const groundUpdated: { x: number; y: number; ore: number; crystal: number }[] = [];
  const gridWidth = Math.floor(world.width);
  for (let i = 0; i < world.groundGrid.length && i < prev.groundGrid.length; i++) {
    const cur = world.groundGrid[i];
    const old = prev.groundGrid[i];
    if (cur.ore !== old.ore || cur.crystal !== old.crystal) {
      const x = i % gridWidth;
      const y = Math.floor(i / gridWidth);
      groundUpdated.push({ x, y, ore: cur.ore, crystal: cur.crystal });
    }
  }

  return {
    tick: world.tick,
    characters: { updated: charUpdated, added: charAdded, removed: charRemoved },
    resourceNodes: { updated: rnUpdated, added: rnAdded, removed: rnRemoved },
    energyNodes: { updated: enUpdated, added: enAdded, removed: enRemoved },
    remains: { added: remAdded, removed: remRemoved },
    groundGrid: { updated: groundUpdated },
    events: convertEvents(result.events, managed),
    stats,
  };
}

function convertEvents(events: SimulationEvent[], managed: ManagedWorld): GameEvent[] {
  const result: GameEvent[] = [];
  const speciesBeforeDeath = new Map<string, string>();

  for (const c of managed.world.characters) {
    speciesBeforeDeath.set(c.id, c.species);
  }

  for (const e of events) {
    if (e.type === 'character_spawned') {
      const child = managed.world.characters.find((c) => c.id === e.childId);
      result.push({
        type: 'character_spawned',
        parentId: e.parentId,
        childId: e.childId,
        species: child?.species ?? 'Unknown',
        tick: managed.world.tick,
      });
    }
    if (e.type === 'character_died') {
      const species = speciesBeforeDeath.get(e.id) ?? 'Unknown';
      result.push({
        type: 'character_died',
        characterId: e.id,
        species,
        tick: managed.world.tick,
      });

      const remaining = managed.world.characters.filter((c) => c.species === species).length;
      if (remaining === 0) {
        result.push({
          type: 'species_extinct',
          species,
          tick: managed.world.tick,
        });
      }
    }
  }

  return result;
}
