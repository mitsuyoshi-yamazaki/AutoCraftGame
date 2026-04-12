import { useCallback, useRef, useState } from 'react';
import type {
  WorldSnapshot,
  TickDelta,
  CharacterDTO,
  ResourceNodeDTO,
  EnergyNodeDTO,
  RemainsDTO,
  GroundCellDTO,
  WorldStats,
  GameEvent,
} from '@shared/types.js';

export interface ClientWorldState {
  tick: number;
  width: number;
  height: number;
  characters: Map<string, CharacterDTO>;
  resourceNodes: Map<string, ResourceNodeDTO>;
  energyNodes: Map<string, EnergyNodeDTO>;
  remains: Map<string, RemainsDTO>;
  groundGrid: GroundCellDTO[];
  stats: WorldStats;
}

const EMPTY_STATS: WorldStats = {
  characterCount: 0,
  totalBirths: 0,
  totalDeaths: 0,
  resourceNodeCount: 0,
  energyNodeCount: 0,
  remainsCount: 0,
  speciesCounts: {},
};

function createEmptyState(): ClientWorldState {
  return {
    tick: 0,
    width: 0,
    height: 0,
    characters: new Map(),
    resourceNodes: new Map(),
    energyNodes: new Map(),
    remains: new Map(),
    groundGrid: [],
    stats: EMPTY_STATS,
  };
}

function applySnapshot(snapshot: WorldSnapshot): ClientWorldState {
  const characters = new Map<string, CharacterDTO>();
  for (const c of snapshot.characters) characters.set(c.id, c);

  const resourceNodes = new Map<string, ResourceNodeDTO>();
  for (const n of snapshot.resourceNodes) resourceNodes.set(n.id, n);

  const energyNodes = new Map<string, EnergyNodeDTO>();
  for (const n of snapshot.energyNodes) energyNodes.set(n.id, n);

  const remains = new Map<string, RemainsDTO>();
  for (const r of snapshot.remains) remains.set(r.id, r);

  return {
    tick: snapshot.tick,
    width: snapshot.width,
    height: snapshot.height,
    characters,
    resourceNodes,
    energyNodes,
    remains,
    groundGrid: [...snapshot.groundGrid],
    stats: snapshot.stats,
  };
}

function applyDelta(prev: ClientWorldState, delta: TickDelta): ClientWorldState {
  // Characters
  const characters = new Map(prev.characters);
  for (const id of delta.characters.removed) characters.delete(id);
  for (const added of delta.characters.added) characters.set(added.id, added);
  for (const updated of delta.characters.updated) {
    const existing = characters.get(updated.id!);
    if (existing) {
      characters.set(updated.id!, { ...existing, ...updated } as CharacterDTO);
    }
  }

  // Resource nodes
  const resourceNodes = new Map(prev.resourceNodes);
  for (const id of delta.resourceNodes.removed) resourceNodes.delete(id);
  for (const added of delta.resourceNodes.added) resourceNodes.set(added.id, added);
  for (const updated of delta.resourceNodes.updated) {
    const existing = resourceNodes.get(updated.id!);
    if (existing) {
      resourceNodes.set(updated.id!, { ...existing, ...updated } as ResourceNodeDTO);
    }
  }

  // Energy nodes
  const energyNodes = new Map(prev.energyNodes);
  for (const id of delta.energyNodes.removed) energyNodes.delete(id);
  for (const added of delta.energyNodes.added) energyNodes.set(added.id, added);
  for (const updated of delta.energyNodes.updated) {
    const existing = energyNodes.get(updated.id!);
    if (existing) {
      energyNodes.set(updated.id!, { ...existing, ...updated } as EnergyNodeDTO);
    }
  }

  // Remains
  const remains = new Map(prev.remains);
  for (const id of delta.remains.removed) remains.delete(id);
  for (const added of delta.remains.added) remains.set(added.id, added);

  // Ground grid
  const groundGrid = [...prev.groundGrid];
  if (delta.groundGrid?.updated) {
    for (const cell of delta.groundGrid.updated) {
      const idx = cell.y * prev.width + cell.x;
      if (idx >= 0 && idx < groundGrid.length) {
        groundGrid[idx] = { ore: cell.ore, crystal: cell.crystal };
      }
    }
  }

  return {
    tick: delta.tick,
    width: prev.width,
    height: prev.height,
    characters,
    resourceNodes,
    energyNodes,
    remains,
    groundGrid,
    stats: delta.stats,
  };
}

const MAX_EVENTS = 100;

export interface UseWorldStateReturn {
  state: ClientWorldState;
  events: GameEvent[];
  handleSnapshot: (snapshot: WorldSnapshot) => void;
  handleTick: (delta: TickDelta) => void;
  reset: () => void;
}

export function useWorldState(): UseWorldStateReturn {
  const stateRef = useRef<ClientWorldState>(createEmptyState());
  const eventsRef = useRef<GameEvent[]>([]);
  const [, setVersion] = useState(0);

  const forceUpdate = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  const handleSnapshot = useCallback((snapshot: WorldSnapshot) => {
    stateRef.current = applySnapshot(snapshot);
    eventsRef.current = [];
    forceUpdate();
  }, [forceUpdate]);

  const handleTick = useCallback((delta: TickDelta) => {
    stateRef.current = applyDelta(stateRef.current, delta);
    if (delta.events.length > 0) {
      const combined = [...eventsRef.current, ...delta.events];
      eventsRef.current = combined.length > MAX_EVENTS
        ? combined.slice(combined.length - MAX_EVENTS)
        : combined;
    }
    forceUpdate();
  }, [forceUpdate]);

  const reset = useCallback(() => {
    stateRef.current = createEmptyState();
    eventsRef.current = [];
    forceUpdate();
  }, [forceUpdate]);

  return {
    state: stateRef.current,
    events: eventsRef.current,
    handleSnapshot,
    handleTick,
    reset,
  };
}
