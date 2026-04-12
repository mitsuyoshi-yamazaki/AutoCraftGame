import type { ClientWorldState } from '../hooks/useWorldState.js';
import type { Selection } from '../renderer/WorldRenderer.js';

const FRAME_DURABILITY = 100;

interface Props {
  state: ClientWorldState;
  selection: Selection | null;
}

export function DetailPanel({ state, selection }: Props) {
  if (!selection) {
    return (
      <div className="panel-section">
        <h3>Selected</h3>
        <em>Click an object</em>
      </div>
    );
  }

  if (selection.type === 'character') {
    const char = state.characters.get(selection.id);
    if (!char) {
      return (
        <div className="panel-section">
          <h3>Selected</h3>
          <em>Object not found</em>
        </div>
      );
    }
    const maxDur = char.components.filter((c) => c === 'Frame').length * FRAME_DURABILITY;
    const invEntries = Object.entries(char.inventory).filter(([, v]) => v > 0);
    const invText = invEntries.length > 0
      ? invEntries.map(([k, v]) => `${k}: ${v}`).join(', ')
      : 'empty';
    const age = state.tick - char.createdAt;
    const active = char.components.includes('Processor');

    return (
      <div className="panel-section">
        <h3>Character</h3>
        <div className="row"><span className="id-value">{char.id}</span> {active ? '(active)' : '(inactive)'}</div>
        <div className="row">Species: <span className="value">{char.species}</span></div>
        <div className="row">Age: <span className="value">{age} ticks</span></div>
        <div className="row">Pos: <span className="value">({char.position.x.toFixed(1)}, {char.position.y.toFixed(1)})</span></div>
        <div className="row">Vel: <span className="value">({char.velocity.vx.toFixed(2)}, {char.velocity.vy.toFixed(2)})</span></div>
        <div className="row">Durability: <span className="value">{char.durability} / {maxDur}</span></div>
        <div className="row">Energy: <span className="value">{char.energy}</span></div>
        <div className="row">Action: <span className="value">{char.action ?? '-'}</span></div>
        <div className="row">Components: <span className="value">{char.components.join(', ')}</span></div>
        <div className="row">Inventory: <span className="value">{invText}</span></div>
      </div>
    );
  }

  if (selection.type === 'resourceNode') {
    const node = state.resourceNodes.get(selection.id);
    if (!node) {
      return (
        <div className="panel-section">
          <h3>Selected</h3>
          <em>Object not found</em>
        </div>
      );
    }
    return (
      <div className="panel-section">
        <h3>Resource Node</h3>
        <div className="row"><span className="id-value">{node.type}</span></div>
        <div className="row">Pos: <span className="value">({node.position.x.toFixed(1)}, {node.position.y.toFixed(1)})</span></div>
        <div className="row">Remaining: <span className="value">{node.remaining}</span></div>
        <div className="row">Created: <span className="value">tick {node.createdAt}</span></div>
      </div>
    );
  }

  if (selection.type === 'energyNode') {
    const node = state.energyNodes.get(selection.id);
    if (!node) {
      return (
        <div className="panel-section">
          <h3>Selected</h3>
          <em>Object not found</em>
        </div>
      );
    }
    return (
      <div className="panel-section">
        <h3>Energy Node</h3>
        <div className="row">Pos: <span className="value">({node.position.x.toFixed(1)}, {node.position.y.toFixed(1)})</span></div>
        <div className="row">Stored: <span className="value">{node.stored} / {node.maxStored}</span></div>
        <div className="row">Production: <span className="value">{node.productionRate}/tick</span></div>
        <div className="row">Created: <span className="value">tick {node.createdAt}</span></div>
      </div>
    );
  }

  if (selection.type === 'remains') {
    const rem = state.remains.get(selection.id);
    if (!rem) {
      return (
        <div className="panel-section">
          <h3>Selected</h3>
          <em>Object not found</em>
        </div>
      );
    }
    const invEntries = Object.entries(rem.inventory).filter(([, v]) => v > 0);
    const invText = invEntries.length > 0
      ? invEntries.map(([k, v]) => `${k}: ${v}`).join(', ')
      : 'empty';
    const elapsed = state.tick - rem.createdAt;

    return (
      <div className="panel-section">
        <h3>Remains</h3>
        <div className="row">Pos: <span className="value">({rem.position.x.toFixed(1)}, {rem.position.y.toFixed(1)})</span></div>
        <div className="row">Age: <span className="value">{elapsed} ticks</span></div>
        <div className="row">Components: <span className="value">{rem.components.join(', ')}</span></div>
        <div className="row">Inventory: <span className="value">{invText}</span></div>
      </div>
    );
  }

  return null;
}
