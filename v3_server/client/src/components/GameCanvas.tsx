import { useEffect, useRef, useCallback } from 'react';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import type { Selection, HitResult } from '../renderer/WorldRenderer.js';
import type { ClientWorldState } from '../hooks/useWorldState.js';

interface Props {
  state: ClientWorldState;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
}

export function GameCanvas({ state, selection, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const stateRef = useRef<ClientWorldState>(state);
  const selectionRef = useRef<Selection | null>(selection);
  const initializedWorld = useRef(false);

  // Keep refs up to date
  stateRef.current = state;
  selectionRef.current = selection;

  const handleSelect = useCallback((hit: HitResult | null) => {
    if (!hit) {
      onSelect(null);
      return;
    }
    // Toggle: re-clicking the same object deselects
    if (selectionRef.current && selectionRef.current.id === hit.id && selectionRef.current.type === hit.type) {
      onSelect(null);
    } else {
      onSelect({ id: hit.id, type: hit.type });
    }
  }, [onSelect]);

  const handleViewChange = useCallback(() => {
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.draw(stateRef.current, selectionRef.current);
    }
  }, []);

  // Initialize renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WorldRenderer();
    rendererRef.current = renderer;

    renderer.init(canvas).then(() => {
      renderer.setupInteraction(
        handleSelect,
        () => stateRef.current,
        handleViewChange,
      );
    });

    return () => {
      renderer.destroy();
      rendererRef.current = null;
      initializedWorld.current = false;
    };
  }, [handleSelect, handleViewChange]);

  // Draw on state/selection change
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    // Reset view when world dimensions first become available
    if (state.width > 0 && !initializedWorld.current) {
      renderer.resetView(state.width, state.height);
      initializedWorld.current = true;
    }

    renderer.draw(state, selection);
  }, [state, selection]);

  return (
    <div className="canvas-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
