import type {
  World,
  WorldObject,
  AssemblerObject,
  ProcessorObject,
  MaterialObject,
  EnergyObject,
  SimulationEvent,
} from '@/types.js';
import { DEFAULT_GAME_PARAMS } from '@/params.js';
import { createInitialState, DEFAULT_INITIAL_CONFIG } from '@/initial-state.js';
import { executeTick } from '@/simulation.js';
import { GAME_VERSION } from '@/version.js';
import { Renderer } from './renderer.js';
import type { DrawSelection } from './renderer.js';

// ============================================================
// Constants
// ============================================================
const MIN_TPS = 1;
const MAX_TPS = 60;
const DEFAULT_TPS = 5;
const MAX_LOG_ENTRIES = 200;

// ============================================================
// State
// ============================================================
type Selection = { kind: string; id: string } | null;

interface UIState {
  world: World;
  running: boolean;
  ticksPerSecond: number;
  selection: Selection;
  totalProduced: number;
}

const params = DEFAULT_GAME_PARAMS;
let state: UIState = {
  world: createInitialState(),
  running: false,
  ticksPerSecond: DEFAULT_TPS,
  selection: null,
  totalProduced: 0,
};
let timerId: ReturnType<typeof setInterval> | null = null;

// ============================================================
// DOM Elements
// ============================================================
const canvasContainer = document.getElementById('canvas-container')!;
const btnReset = document.getElementById('btn-reset')!;
const btnFit = document.getElementById('btn-fit')!;
const btnPlayPause = document.getElementById('btn-play-pause')!;
const btnStep = document.getElementById('btn-step')! as HTMLButtonElement;
const btnSpeedDown = document.getElementById('btn-speed-down')!;
const btnSpeedUp = document.getElementById('btn-speed-up')!;
const speedDisplay = document.getElementById('speed-display')!;
const tickDisplay = document.getElementById('tick-display')!;
const statCharacters = document.getElementById('stat-characters')!;
const statBirths = document.getElementById('stat-births')!;
const statDeaths = document.getElementById('stat-deaths')!;
const statRemains = document.getElementById('stat-remains')!;
const statOldest = document.getElementById('stat-oldest')!;
const statSpecies = document.getElementById('stat-species')!;
const selectedContent = document.getElementById('selected-content')!;
const vmPanel = document.getElementById('vm-panel')!;
const vmContent = document.getElementById('vm-content')!;
const eventLogContent = document.getElementById('event-log-content')!;
const versionDisplay = document.getElementById('version-display')!;
versionDisplay.textContent = `v${GAME_VERSION}`;

// ============================================================
// Renderer
// ============================================================
const renderer = new Renderer();

async function main(): Promise<void> {
  await renderer.init(canvasContainer);
  renderer.resetView(state.world.width, state.world.height);

  renderer.setupInteraction(
    (hit) => {
      if (hit?.kind === 'object') {
        state = { ...state, selection: { kind: hit.object.kind, id: hit.object.id } };
      } else {
        state = { ...state, selection: null };
      }
      render();
    },
    () => state.world,
    () => render(),
  );

  speedDisplay.textContent = String(state.ticksPerSecond);
  render();
}

// ============================================================
// Simulation Step
// ============================================================
function step(): void {
  const result = executeTick(state.world, params);

  let produced = 0;
  for (const event of result.events) {
    if (event.type === 'assembler_completed') produced++;
  }

  state = {
    ...state,
    world: result.world,
    totalProduced: state.totalProduced + produced,
  };

  if (state.selection) {
    const still = result.world.objects.some(o => o.id === state.selection!.id);
    if (!still) state = { ...state, selection: null };
  }

  appendEvents(result.events, result.world.tick);
  render();
}

// ============================================================
// Timer
// ============================================================
function startTimer(): void {
  stopTimer();
  timerId = setInterval(step, Math.round(1000 / state.ticksPerSecond));
}
function stopTimer(): void {
  if (timerId !== null) { clearInterval(timerId); timerId = null; }
}
function updatePlayPauseUI(): void {
  btnPlayPause.textContent = state.running ? '\u23F8' : '\u25B6';
  btnStep.disabled = state.running;
}
function toggleRunning(): void {
  state = { ...state, running: !state.running };
  if (state.running) startTimer(); else stopTimer();
  updatePlayPauseUI();
}
function setSpeed(tps: number): void {
  state = { ...state, ticksPerSecond: Math.max(MIN_TPS, Math.min(MAX_TPS, tps)) };
  speedDisplay.textContent = String(state.ticksPerSecond);
  if (state.running) startTimer();
}

// ============================================================
// Rendering
// ============================================================
function render(): void {
  renderer.draw(state.world, state.selection as DrawSelection);
  updateStats();
  updateSelected();
}

function updateStats(): void {
  const objs = state.world.objects;
  const assemblers = objs.filter(o => o.kind === 'assembler');
  const processors = objs.filter(o => o.kind === 'processor');
  const materials = objs.filter(o => o.kind === 'material');
  const energy = objs.filter(o => o.kind === 'energy');
  const running = processors.filter(o => (o as ProcessorObject).running);

  tickDisplay.textContent = `Tick: ${state.world.tick}`;
  statCharacters.textContent = `${assemblers.length + processors.length}`;
  statBirths.textContent = String(state.totalProduced);
  statDeaths.textContent = '-';
  statRemains.textContent = `${materials.length} mat, ${energy.length} eng`;

  statOldest.innerHTML = '';
  statSpecies.innerHTML = '';

  // Object summary
  const summary = document.createElement('div');
  summary.innerHTML = `
    <div>Assemblers: ${assemblers.length} (gathering: ${assemblers.filter(a => (a as AssemblerObject).phase === 'gathering').length})</div>
    <div>Processors: ${processors.length} (running: ${running.length})</div>
    <div>Materials: ${materials.length}</div>
    <div>Energy: ${energy.length}</div>
  `;
  statSpecies.appendChild(summary);
}

function updateSelected(): void {
  if (!state.selection) {
    selectedContent.innerHTML = '<em>Click an object</em>';
    vmPanel.style.display = 'none';
    return;
  }

  const obj = state.world.objects.find(o => o.id === state.selection!.id);
  if (!obj) {
    selectedContent.innerHTML = '<em>Object no longer exists</em>';
    vmPanel.style.display = 'none';
    return;
  }

  const pos = `(${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)})`;

  switch (obj.kind) {
    case 'assembler': {
      const a = obj as AssemblerObject;
      selectedContent.innerHTML = `
        <div><strong>Assembler</strong> ${a.id}</div>
        <div>Pos: ${pos}</div>
        <div>Phase: ${a.phase}</div>
        <div>Recipe: ${a.recipe || 'none'}</div>
        <div>Ticks remaining: ${a.assembleTicksRemaining}</div>
        <div>Gathered: ${JSON.stringify(a.gatherProgress)}</div>
        <div>Energy gathered: ${a.gatheredEnergy}</div>
        <div>OpMem: [${a.operationMemory.join(', ')}]</div>
      `;
      vmPanel.style.display = 'none';
      break;
    }
    case 'processor': {
      const p = obj as ProcessorObject;
      selectedContent.innerHTML = `
        <div><strong>Processor</strong> ${p.id}</div>
        <div>Pos: ${pos}</div>
        <div>Running: ${p.running}</div>
        <div>PC: ${p.pc}</div>
        <div>Registers: [${p.registers.join(', ')}]</div>
      `;
      vmPanel.style.display = '';
      const nonZero = p.memory.filter(w => w !== 0).length;
      vmContent.innerHTML = `
        <div><strong>Memory</strong>: ${p.memory.length} words (${nonZero} non-zero)</div>
        <div><strong>OpMem</strong>: [${p.operationMemory.slice(0, 5).join(', ')}...]</div>
      `;
      break;
    }
    case 'material': {
      const m = obj as MaterialObject;
      selectedContent.innerHTML = `
        <div><strong>Material</strong> ${m.id}</div>
        <div>Type: ${m.materialType}</div>
        <div>Amount: ${m.amount}</div>
        <div>Pos: ${pos}</div>
      `;
      vmPanel.style.display = 'none';
      break;
    }
    case 'energy': {
      const e = obj as EnergyObject;
      selectedContent.innerHTML = `
        <div><strong>Energy</strong> ${e.id}</div>
        <div>Amount: ${e.amount}</div>
        <div>Pos: ${pos}</div>
      `;
      vmPanel.style.display = 'none';
      break;
    }
  }
}

function appendEvents(events: readonly SimulationEvent[], tick: number): void {
  for (const event of events) {
    if (event.type !== 'assembler_completed') continue;
    const div = document.createElement('div');
    div.className = 'log-entry log-birth';
    div.textContent = `[tick ${tick}] ${event.id} → ${event.productId}`;
    eventLogContent.appendChild(div);
  }
  // Trim old entries
  while (eventLogContent.children.length > MAX_LOG_ENTRIES) {
    eventLogContent.removeChild(eventLogContent.firstChild!);
  }
  eventLogContent.scrollTop = eventLogContent.scrollHeight;
}

// ============================================================
// Reset
// ============================================================
function resetWorld(): void {
  stopTimer();
  state = {
    world: createInitialState(),
    running: false,
    ticksPerSecond: state.ticksPerSecond,
    selection: null,
    totalProduced: 0,
  };
  renderer.resetView(state.world.width, state.world.height);
  updatePlayPauseUI();
  eventLogContent.innerHTML = '';
  render();
}

// ============================================================
// Event Listeners
// ============================================================
btnReset.addEventListener('click', resetWorld);
btnFit.addEventListener('click', () => { renderer.resetView(state.world.width, state.world.height); render(); });
btnPlayPause.addEventListener('click', toggleRunning);
btnStep.addEventListener('click', () => { if (!state.running) step(); });
btnSpeedDown.addEventListener('click', () => setSpeed(state.ticksPerSecond - 1));
btnSpeedUp.addEventListener('click', () => setSpeed(state.ticksPerSecond + 1));

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    toggleRunning();
  }
});

window.addEventListener('resize', () => render());

// ============================================================
// Boot
// ============================================================
main();
