import type { World, SimulationEvent, Action, Program, ComponentType, Position } from '@/types.js';
import { createWorld, createRng, addCharacter } from '@/world.js';
import type { WorldConfig } from '@/world.js';
import { DEFAULT_WORLD_CONFIG } from '@/world.js';
import { createCharacter, isActive } from '@/character.js';
import { MIN_COMPONENTS } from '@/recipes.js';
import { calculateMass } from '@/recipes.js';
import { FRAME_DURABILITY } from '@/constants.js';
import { executeTick } from '@/simulation.js';
import { evaluateProgram } from '@/program.js';
import { Renderer } from './renderer.js';
import type { HitResult } from './renderer.js';
import selfReplicatorProgram from '../programs/self-replicator.json';
import scavengerProgram from '../programs/scavenger.json';
import opportunistProgram from '../programs/opportunist.json';

// ============================================================
// Constants
// ============================================================
const MIN_TPS = 1;
const MAX_TPS = 60;
const DEFAULT_TPS = 5;
const INITIAL_ENERGY = 5000;
const DEFAULT_SEED = 42;
const INITIAL_COUNT = 5;

// ============================================================
// State
// ============================================================
type Selection =
  | { kind: 'character'; id: string }
  | { kind: 'resourceNode'; id: string }
  | { kind: 'energyNode'; id: string }
  | { kind: 'remains'; id: string }
  | null;

interface UIState {
  world: World;
  allEvents: SimulationEvent[];
  running: boolean;
  ticksPerSecond: number;
  selection: Selection;
  totalBirths: number;
  totalDeaths: number;
  characterActions: Map<string, Action>;
}

interface ProgramDef {
  name: string;
  components: ComponentType[];
  program: Program;
  count: number;
}

function loadProgram(json: any): ProgramDef {
  const rules = json.rules.map((r: any) => ({
    condition: r.condition,
    action: r.action,
  }));
  const components: ComponentType[] = json.components ?? [...MIN_COMPONENTS];
  return {
    name: json.name ?? 'Unknown',
    components,
    program: { name: json.name, rules },
    count: INITIAL_COUNT,
  };
}

const PROGRAM_DEFS: ProgramDef[] = [
  loadProgram(selfReplicatorProgram),
  loadProgram(scavengerProgram),
  loadProgram(opportunistProgram),
];

function createInitialState(seed?: number): UIState {
  const rng = createRng(seed ?? DEFAULT_SEED);
  let world = createWorld(DEFAULT_WORLD_CONFIG, rng);

  let firstCharId: string | null = null;

  for (const def of PROGRAM_DEFS) {
    for (let i = 0; i < def.count; i++) {
      const pos: Position = {
        x: 1 + rng() * (world.width - 2),
        y: 1 + rng() * (world.height - 2),
      };
      const id = `char-${String(world.nextCharacterId).padStart(3, '0')}`;
      world = { ...world, nextCharacterId: world.nextCharacterId + 1 };
      const character = createCharacter(id, pos, [...def.components], def.program, INITIAL_ENERGY);
      world = addCharacter(world, character);
      if (!firstCharId) firstCharId = id;
    }
  }

  return {
    world,
    allEvents: [],
    running: false,
    ticksPerSecond: DEFAULT_TPS,
    selection: firstCharId ? { kind: 'character', id: firstCharId } : null,
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
const statResources = document.getElementById('stat-resources')!;
const statEnergy = document.getElementById('stat-energy')!;
const statRemains = document.getElementById('stat-remains')!;
const statSpecies = document.getElementById('stat-species')!;
const selectedContent = document.getElementById('selected-content')!;
const eventLogContent = document.getElementById('event-log-content')!;

// ============================================================
// Initialize pixi.js and start
// ============================================================
const renderer = new Renderer();

async function main(): Promise<void> {
  await renderer.init(canvasContainer);
  renderer.resetView(state.world.width, state.world.height);

  renderer.setupInteraction(
    (hit) => {
      let selection: Selection = null;
      if (hit) {
        if (hit.kind === 'character') selection = { kind: 'character', id: hit.character.id };
        else if (hit.kind === 'resourceNode') selection = { kind: 'resourceNode', id: hit.resourceNode.id };
        else if (hit.kind === 'energyNode') selection = { kind: 'energyNode', id: hit.energyNode.id };
        else if (hit.kind === 'remains') selection = { kind: 'remains', id: hit.remains.id };
      }
      state = { ...state, selection };
      render();
    },
    () => state.world,
  );

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
      const result = evaluateProgram(char.program, char, state.world);
      actions.set(char.id, result.action);
    }
  }

  const prevWorld = state.world;
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

  // Clear selection if selected object no longer exists
  if (state.selection?.kind === 'character') {
    if (!result.world.characters.some((c) => c.id === state.selection!.id)) {
      state = { ...state, selection: null };
    }
  }
  if (state.selection?.kind === 'remains') {
    if (!result.world.remains.some((r) => r.id === state.selection!.id)) {
      state = { ...state, selection: null };
    }
  }

  appendEvents(result.events, result.world.tick, prevWorld, result.world);
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
  if (state.running) startTimer(); else stopTimer();
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
function getSelectedCharacterId(): string | null {
  return state.selection?.kind === 'character' ? state.selection.id : null;
}

function render(): void {
  renderer.draw(state.world, getSelectedCharacterId());
  updateStats();
  updateSelected();
}

function updateStats(): void {
  tickDisplay.textContent = `Tick: ${state.world.tick}`;
  statCharacters.textContent = String(state.world.characters.length);
  statBirths.textContent = String(state.totalBirths);
  statDeaths.textContent = String(state.totalDeaths);
  statResources.textContent = String(state.world.resourceNodes.length);
  const totalEnergy = state.world.energyNodes.reduce((s, n) => s + n.stored, 0);
  statEnergy.textContent = String(totalEnergy);
  statRemains.textContent = String(state.world.remains.length);

  const counts = new Map<string, number>();
  for (const c of state.world.characters) {
    const name = c.program?.name ?? '(inactive)';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  statSpecies.innerHTML = '';
  for (const [name, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const div = document.createElement('div');
    div.textContent = `${name}: ${count}`;
    div.style.cursor = 'pointer';
    div.dataset.species = name;
    statSpecies.appendChild(div);
  }
}

function updateSelected(): void {
  if (!state.selection) {
    selectedContent.innerHTML = '<em>Click an object</em>';
    return;
  }

  const sel = state.selection;

  if (sel.kind === 'character') {
    const char = state.world.characters.find((c) => c.id === sel.id);
    if (!char) { selectedContent.innerHTML = '<em>Click an object</em>'; return; }

    const action = state.characterActions.get(char.id);
    const actionText = action ? action.op : '-';
    const maxDur = char.components.filter((c) => c === 'Frame').length * FRAME_DURABILITY;
    const programName = char.program?.name ?? '(none)';
    const mass = calculateMass(char.components, char.inventory);
    const invEntries = Object.entries(char.inventory).filter(([, v]) => v > 0);
    const invText = invEntries.length > 0
      ? invEntries.map(([k, v]) => `${k}: ${v}`).join(', ')
      : 'empty';

    selectedContent.innerHTML = `
      <div><strong>${char.id}</strong> ${isActive(char) ? '(active)' : '(inactive)'}</div>
      <div>Program: ${programName}</div>
      <div>Pos: (${char.position.x.toFixed(1)}, ${char.position.y.toFixed(1)})</div>
      <div>Mass: ${mass}</div>
      <div>Durability: ${char.durability} / ${maxDur}</div>
      <div>Energy: ${char.energy}</div>
      <div>Action: ${actionText}</div>
      <div>Components: ${char.components.join(', ')}</div>
      <div>Inventory: ${invText}</div>
    `;
    return;
  }

  if (sel.kind === 'resourceNode') {
    const node = state.world.resourceNodes.find((n) => n.id === sel.id);
    if (!node) { selectedContent.innerHTML = '<em>Click an object</em>'; return; }
    selectedContent.innerHTML = `
      <div><strong>${node.type}</strong></div>
      <div>Pos: (${node.position.x.toFixed(1)}, ${node.position.y.toFixed(1)})</div>
      <div>Remaining: ${node.remaining}</div>
    `;
    return;
  }

  if (sel.kind === 'energyNode') {
    const node = state.world.energyNodes.find((n) => n.id === sel.id);
    if (!node) { selectedContent.innerHTML = '<em>Click an object</em>'; return; }
    selectedContent.innerHTML = `
      <div><strong>EnergyNode</strong></div>
      <div>Pos: (${node.position.x.toFixed(1)}, ${node.position.y.toFixed(1)})</div>
      <div>Stored: ${node.stored} / ${node.maxStored}</div>
      <div>Production: ${node.productionRate}/tick</div>
    `;
    return;
  }

  if (sel.kind === 'remains') {
    const rem = state.world.remains.find((r) => r.id === sel.id);
    if (!rem) { selectedContent.innerHTML = '<em>Click an object</em>'; return; }
    const invEntries = Object.entries(rem.inventory).filter(([, v]) => v > 0);
    const invText = invEntries.length > 0
      ? invEntries.map(([k, v]) => `${k}: ${v}`).join(', ')
      : 'empty';
    selectedContent.innerHTML = `
      <div><strong>Remains</strong></div>
      <div>Pos: (${rem.position.x.toFixed(1)}, ${rem.position.y.toFixed(1)})</div>
      <div>Components: ${rem.components.join(', ')}</div>
      <div>Inventory: ${invText}</div>
    `;
    return;
  }
}

function getProgramName(world: World, charId: string): string {
  const char = world.characters.find((c) => c.id === charId);
  return char?.program?.name ?? '?';
}

function appendEvents(events: readonly SimulationEvent[], tick: number, oldWorld: World, newWorld: World): void {
  for (const event of events) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    if (event.type === 'character_spawned') {
      const name = getProgramName(oldWorld, event.parentId);
      div.textContent = `[tick ${tick}] ${event.parentId} (${name}) spawned ${event.childId}`;
      div.classList.add('log-birth');
    } else {
      const name = getProgramName(oldWorld, event.id);
      div.textContent = `[tick ${tick}] ${event.id} (${name}) died`;
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
  renderer.resetView(state.world.width, state.world.height);
  btnPlayPause.textContent = '▶';
  eventLogContent.innerHTML = '';
  render();
}

// ============================================================
// Event listeners
// ============================================================
const btnFit = document.getElementById('btn-fit')!;

btnReset.addEventListener('click', resetWithRandomSeed);
btnFit.addEventListener('click', () => {
  renderer.resetView(state.world.width, state.world.height);
  render();
});
btnPlayPause.addEventListener('click', toggleRunning);
btnSpeedDown.addEventListener('click', () => setSpeed(state.ticksPerSecond - 1));
btnSpeedUp.addEventListener('click', () => setSpeed(state.ticksPerSecond + 1));
statSpecies.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const species = target.dataset?.species;
  if (!species) return;
  const members = state.world.characters.filter((c) => (c.program?.name ?? '(inactive)') === species);
  if (members.length === 0) return;
  const currentId = state.selection?.kind === 'character' ? state.selection.id : null;
  const currentIdx = currentId ? members.findIndex((c) => c.id === currentId) : -1;
  const next = currentIdx >= 0 ? members[(currentIdx + 1) % members.length] : members[0];
  state = { ...state, selection: { kind: 'character', id: next.id } };
  render();
});

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
