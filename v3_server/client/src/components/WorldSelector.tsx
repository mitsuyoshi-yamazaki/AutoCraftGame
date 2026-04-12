import { useEffect, useState, useCallback } from 'react';
import type { WorldSummary } from '@shared/types.js';
import { fetchWorlds } from '../api/rest.js';

interface Props {
  selectedWorldId: string | null;
  onSelectWorld: (worldId: string) => void;
  tick: number;
  ticksPerSecond: number | null;
}

const POLL_INTERVAL = 5000;

export function WorldSelector({ selectedWorldId, onSelectWorld, tick, ticksPerSecond }: Props) {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);

  const loadWorlds = useCallback(async () => {
    try {
      const list = await fetchWorlds();
      setWorlds(list);
      if (!selectedWorldId && list.length > 0) {
        onSelectWorld(list[0].id);
      }
    } catch {
      // Server not yet available
    }
  }, [selectedWorldId, onSelectWorld]);

  useEffect(() => {
    loadWorlds();
    const timer = setInterval(loadWorlds, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [loadWorlds]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSelectWorld(e.target.value);
  };

  const tickText = tick > 0 ? `Tick: ${tick.toLocaleString()}` : '';
  const tpsText = ticksPerSecond !== null ? `${ticksPerSecond} ticks/sec` : '';

  return (
    <div className="header">
      <span className="header-title">v3_server</span>
      <label>
        World:
        <select value={selectedWorldId ?? ''} onChange={handleChange}>
          {worlds.length === 0 && <option value="">--</option>}
          {worlds.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.status})
            </option>
          ))}
        </select>
      </label>
      <span className="header-info">
        {tickText}
        {tickText && tpsText ? '  |  ' : ''}
        {tpsText}
      </span>
    </div>
  );
}
