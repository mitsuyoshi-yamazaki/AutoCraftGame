// ============================================================
// Shared types for v3_server API (server ↔ client)
// ============================================================

// --- Game object types (subset for transport) ---

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  vx: number;
  vy: number;
}

export type ResourceNodeType = 'OreNode' | 'CrystalNode';

export type ComponentType =
  | 'Frame' | 'Actuator' | 'Sensor' | 'Processor'
  | 'Harvester' | 'Assembler' | 'Disassembler' | 'Charger'
  | 'MemoryCore' | 'Register';

export interface CharacterDTO {
  id: string;
  species: string;
  position: Position;
  velocity: Velocity;
  components: ComponentType[];
  inventory: Record<string, number>;
  durability: number;
  energy: number;
  action?: string;
  senseData: SenseDataDTO | null;
  registers: (number | null)[];
  createdAt: number;
}

export interface SenseDataDTO {
  nearestByType: Partial<Record<string, { relativePosition: Position }>>;
}

export interface ResourceNodeDTO {
  id: string;
  position: Position;
  type: ResourceNodeType;
  remaining: number;
  createdAt: number;
}

export interface EnergyNodeDTO {
  id: string;
  position: Position;
  productionRate: number;
  stored: number;
  maxStored: number;
  createdAt: number;
}

export interface RemainsDTO {
  id: string;
  position: Position;
  components: ComponentType[];
  inventory: Record<string, number>;
  createdAt: number;
}

export interface GroundCellDTO {
  ore: number;
  crystal: number;
}

// --- World stats ---

export interface WorldStats {
  characterCount: number;
  totalBirths: number;
  totalDeaths: number;
  resourceNodeCount: number;
  energyNodeCount: number;
  remainsCount: number;
  speciesCounts: Record<string, number>;
}

// --- REST API responses ---

export interface WorldSummary {
  id: string;
  name: string;
  status: 'running' | 'stopped';
  tick: number;
  characterCount: number;
  createdAt: string;
}

export interface WorldDetail extends WorldSummary {
  width: number;
  height: number;
  ticksPerSecond: number;
  stats: WorldStats;
}

// --- WebSocket messages ---

export interface WorldSnapshot {
  tick: number;
  width: number;
  height: number;
  characters: CharacterDTO[];
  resourceNodes: ResourceNodeDTO[];
  energyNodes: EnergyNodeDTO[];
  remains: RemainsDTO[];
  groundGrid: GroundCellDTO[];
  stats: WorldStats;
}

export interface TickDelta {
  tick: number;
  characters: {
    updated: Partial<CharacterDTO & { id: string }>[];
    added: CharacterDTO[];
    removed: string[];
  };
  resourceNodes: {
    updated: Partial<ResourceNodeDTO & { id: string }>[];
    added: ResourceNodeDTO[];
    removed: string[];
  };
  energyNodes: {
    updated: Partial<EnergyNodeDTO & { id: string }>[];
    added: EnergyNodeDTO[];
    removed: string[];
  };
  remains: {
    added: RemainsDTO[];
    removed: string[];
  };
  groundGrid: {
    updated: { x: number; y: number; ore: number; crystal: number }[];
  };
  events: GameEvent[];
  stats: WorldStats;
}

export type GameEvent =
  | { type: 'character_spawned'; parentId: string; childId: string; species: string; tick: number }
  | { type: 'character_died'; characterId: string; species: string; tick: number }
  | { type: 'species_extinct'; species: string; tick: number };

export type ServerMessage =
  | { type: 'snapshot'; data: WorldSnapshot }
  | { type: 'tick'; data: TickDelta }
  | { type: 'world_stopped'; data: { reason: string } };
