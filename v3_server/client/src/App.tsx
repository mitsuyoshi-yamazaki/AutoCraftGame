import { useState, useEffect, useCallback, useRef } from 'react';
import { WorldSelector } from './components/WorldSelector.js';
import { GameCanvas } from './components/GameCanvas.js';
import { StatsPanel } from './components/StatsPanel.js';
import { DetailPanel } from './components/DetailPanel.js';
import { EventLog } from './components/EventLog.js';
import { WorldSocket } from './api/websocket.js';
import { fetchWorldDetail } from './api/rest.js';
import { useWorldState } from './hooks/useWorldState.js';
import type { Selection } from './renderer/WorldRenderer.js';

export function App() {
  const [worldId, setWorldId] = useState<string | null>(null);
  const [ticksPerSecond, setTicksPerSecond] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [stopped, setStopped] = useState(false);
  const socketRef = useRef<WorldSocket | null>(null);
  const { state, events, handleSnapshot, handleTick, reset } = useWorldState();

  // Clear selection if the selected object no longer exists
  useEffect(() => {
    if (!selection) return;
    if (selection.type === 'character' && !state.characters.has(selection.id)) {
      setSelection(null);
    } else if (selection.type === 'resourceNode' && !state.resourceNodes.has(selection.id)) {
      setSelection(null);
    } else if (selection.type === 'energyNode' && !state.energyNodes.has(selection.id)) {
      setSelection(null);
    } else if (selection.type === 'remains' && !state.remains.has(selection.id)) {
      setSelection(null);
    }
  }, [state, selection]);

  const connectToWorld = useCallback((id: string) => {
    // Disconnect previous
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    reset();
    setSelection(null);
    setStopped(false);

    // Fetch detail for ticksPerSecond
    fetchWorldDetail(id).then((detail) => {
      setTicksPerSecond(detail.ticksPerSecond);
    }).catch(() => {
      // ignore
    });

    // Connect WebSocket
    const socket = new WorldSocket();
    socketRef.current = socket;

    socket.onSnapshot(handleSnapshot);
    socket.onTick(handleTick);
    socket.onStopped(() => setStopped(true));
    socket.onDisconnect(() => {
      // Could reconnect here if needed
    });

    socket.connect(id);
  }, [handleSnapshot, handleTick, reset]);

  const handleSelectWorld = useCallback((id: string) => {
    setWorldId(id);
    connectToWorld(id);
  }, [connectToWorld]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="app-layout">
      <WorldSelector
        selectedWorldId={worldId}
        onSelectWorld={handleSelectWorld}
        tick={state.tick}
        ticksPerSecond={ticksPerSecond}
      />
      <div className="main-area">
        <GameCanvas
          state={state}
          selection={selection}
          onSelect={setSelection}
        />
        <div className="side-panel">
          <StatsPanel stats={state.stats} />
          <DetailPanel state={state} selection={selection} />
          {stopped && (
            <div className="panel-section">
              <span className="stopped-banner">World Stopped</span>
            </div>
          )}
        </div>
      </div>
      <EventLog events={events} />
    </div>
  );
}
