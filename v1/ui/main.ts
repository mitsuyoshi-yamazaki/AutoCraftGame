import type { World, SimulationEvent, Action } from '@/types.js';
import { createWorld, addCharacter, nextCharacterId, createRng } from '@/world.js';
import { createCharacter, isActive } from '@/character.js';
import { MIN_COMPONENTS } from '@/recipes.js';
import { executeTick } from '@/simulation.js';
import { evaluateProgram } from '@/program.js';
import { Renderer } from './renderer.js';
import selfReplicatorProgram from '../programs/self-replicator.json';

// ============================================================
// Constants
// ============================================================
const MIN_TPS = 1;
const MAX_TPS = 60;
const DEFAULT_TPS = 5;
const MAP_SIZE = 20;
const INITIAL_CHARACTERS = 4;
const DEFAULT_SEED = 42;

// ============================================================
// State
// ============================================================
interface UIState {
  world: World;
  allEvents: SimulationEvent[];
  running: boolean;
  ticksPerSecond: number;
  selectedCharacterId: string | null;
  totalBirths: number;
  totalDeaths: number;
  characterActions: Map<string, Action>;
}

function createInitialState(seed?: number): UIState {
  const rng = createRng(seed ?? DEFAULT_SEED);
  let world = createWorld(MAP_SIZE, MAP_SIZE, rng);

  const rules = selfReplicatorProgram.rules.map((r: any) => ({
    condition: r.condition,
    action: r.action,
  }));
  const program = { rules };

  // Place characters at random non-overlapping positions
  const occupied = new Set(world.resourceNodes.map((n) => `${n.position.x},${n.position.y}`));
  for (let i = 0; i < INITIAL_CHARACTERS; i++) {
    let x: number, y: number, key: string;
    do {
      x = Math.floor(rng() * MAP_SIZE);
      y = Math.floor(rng() * MAP_SIZE);
      key = `${x},${y}`;
    } while (occupied.has(key));
    occupied.add(key);

    const { id, world: w2 } = nextCharacterId(world);
    world = w2;
    const character = createCharacter(id, { x, y }, [...MIN_COMPONENTS], program);
    world = addCharacter(world, character);
  }

  return {
    world,
    allEvents: [],
    running: false,
    ticksPerSecond: DEFAULT_TPS,
    selectedCharacterId: null,
    totalBirths: 0,
    totalDeaths: 0,
    characterActions: new Map(),
  };
}

let state = createInitialState();
let timerId: ReturnType<typeof setInterval> | null = null;

// ============================================================
// DOM elements
// ============================================================
const canvasContainer = document.getElementById('canvas-container')!;
const btnReset = document.getElementById('btn-reset')!;
const btnPlayPause = document.getElementById('btn-play-pause')!;
const btnSpeedDown = document.getElementById('btn-speed-down')!;
const btnSpeedUp = document.getElementById('btn-speed-up')!;
const speedDisplay = document.getElementById('speed-display')!;
const tickDisplay = document.getElementById('tick-display')!;
const statCharacters = document.getElementById('stat-characters')!;
const statBirths = document.getElementById('stat-births')!;
const statDeaths = document.getElementById('stat-deaths')!;
const selectedContent = document.getElementById('selected-content')!;
const eventLogContent = document.getElementById('event-log-content')!;

// ============================================================
// Initialize pixi.js and start
// ============================================================
const renderer = new Renderer();

async function main(): Promise<void> {
  await renderer.init(canvasContainer);

  // Click handler on pixi canvas
  renderer.app.canvas.addEventListener('click', (e: MouseEvent) => {
    const rect = renderer.app.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const char = renderer.hitTest(state.world, x, y);
    state = { ...state, selectedCharacterId: char?.id ?? null };
    render();
  });

  speedDisplay.textContent = String(state.ticksPerSecond);
  render();
}

// ============================================================
// Simulation step
// ============================================================
function step(): void {
  const actions = new Map<string, Action>();
  for (const char of state.world.characters) {
    if (isActive(char) && char.program) {
      const { action } = evaluateProgram(char.program, char, state.world);
      actions.set(char.id, action);
    }
  }

  const result = executeTick(state.world);

  let births = 0;
  let deaths = 0;
  for (const event of result.events) {
    if (event.type === 'character_spawned') births++;
    if (event.type === 'character_died') deaths++;
  }

  state = {
    ...state,
    world: result.world,
    allEvents: [...state.allEvents, ...result.events],
    totalBirths: state.totalBirths + births,
    totalDeaths: state.totalDeaths + deaths,
    characterActions: actions,
  };

  if (
    state.selectedCharacterId &&
    !result.world.characters.some((c) => c.id === state.selectedCharacterId)
  ) {
    state = { ...state, selectedCharacterId: null };
  }

  appendEvents(result.events, result.world.tick);
  render();
}

// ============================================================
// Timer control
// ============================================================
function startTimer(): void {
  stopTimer();
  const interval = Math.round(1000 / state.ticksPerSecond);
  timerId = setInterval(step, interval);
}

function stopTimer(): void {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function toggleRunning(): void {
  state = { ...state, running: !state.running };
  if (state.running) {
    startTimer();
  } else {
    stopTimer();
  }
  btnPlayPause.textContent = state.running ? '⏸' : '▶';
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
  renderer.draw(state.world, state.selectedCharacterId);
  updateStats();
  updateSelected();
}

function updateStats(): void {
  tickDisplay.textContent = `Tick: ${state.world.tick}`;
  statCharacters.textContent = String(state.world.characters.length);
  statBirths.textContent = String(state.totalBirths);
  statDeaths.textContent = String(state.totalDeaths);
}

function updateSelected(): void {
  if (!state.selectedCharacterId) {
    selectedContent.innerHTML = '<em>Click a character</em>';
    return;
  }

  const char = state.world.characters.find((c) => c.id === state.selectedCharacterId);
  if (!char) {
    selectedContent.innerHTML = '<em>Click a character</em>';
    return;
  }

  const action = state.characterActions.get(char.id);
  const actionText = action ? action.op : '-';
  const maxDur = char.components.filter((c) => c === 'Frame').length * 100;

  const invEntries = Object.entries(char.inventory).filter(([, v]) => v > 0);
  const invText = invEntries.length > 0
    ? invEntries.map(([k, v]) => `${k}: ${v}`).join(', ')
    : 'empty';

  selectedContent.innerHTML = `
    <div><strong>${char.id}</strong> ${isActive(char) ? '(active)' : '(inactive)'}</div>
    <div>Pos: (${char.position.x}, ${char.position.y})</div>
    <div>Durability: ${char.durability} / ${maxDur}</div>
    <div>Action: ${actionText}</div>
    <div>Components: ${char.components.join(', ')}</div>
    <div>Inventory: ${invText}</div>
  `;
}

function appendEvents(events: readonly SimulationEvent[], tick: number): void {
  for (const event of events) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    if (event.type === 'character_spawned') {
      div.textContent = `[tick ${tick}] ${event.parentId} spawned ${event.childId}`;
      div.classList.add('log-birth');
    } else {
      div.textContent = `[tick ${tick}] ${event.id} died`;
      div.classList.add('log-death');
    }
    eventLogContent.appendChild(div);
  }
  eventLogContent.scrollTop = eventLogContent.scrollHeight;
}

// ============================================================
// Reset
// ============================================================
function resetWithRandomSeed(): void {
  stopTimer();
  const seed = Date.now() ^ (Math.random() * 0xffffffff);
  state = createInitialState(seed);
  btnPlayPause.textContent = '▶';
  eventLogContent.innerHTML = '';
  render();
}

// ============================================================
// Event listeners
// ============================================================
btnReset.addEventListener('click', resetWithRandomSeed);
btnPlayPause.addEventListener('click', toggleRunning);
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
