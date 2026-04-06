import type { World, SimulationEvent, Action, Program, ComponentType, Position, GroundCell } from '@/types.js';
import { createRng, addCharacter } from '@/world.js';
import type { WorldConfig } from '@/world.js';
import { DEFAULT_WORLD_CONFIG } from '@/world.js';
import { isActive } from '@/character.js';
import { MIN_COMPONENTS } from '@/recipes.js';
import { FRAME_DURABILITY } from '@/constants.js';
import { createEngine } from '@/engine.js';
import type { Engine } from '@/engine.js';
import { DEFAULT_GAME_PARAMS } from '@/params.js';
import { evaluateProgram } from '@/program.js';
import { Renderer } from './renderer.js';
import type { HitResult, DrawSelection } from './renderer.js';
import { GAME_VERSION } from '@/version.js';
import { serialize, deserialize, formatTimestamp, buildSaveFileName } from '@/save-load.js';
import { positionToCell, groundGridDimensions } from '@/ground.js';
import type { SaveData, SavedEvent } from '@/save-load.js';
import selfReplicatorProgram from '../programs/self-replicator.json';
import selfReplicatorExplorerProgram from '../programs/self-replicator-explorer.json';
import selfReplicatorWandererProgram from '../programs/self-replicator-wanderer.json';
import selfReplicatorAvoiderProgram from '../programs/self-replicator-avoider.json';
import scavengerProgram from '../programs/scavenger.json';
import scavengerExplorerProgram from '../programs/scavenger-explorer.json';
import scavengerWandererProgram from '../programs/scavenger-wanderer.json';
import scavengerAvoiderProgram from '../programs/scavenger-avoider.json';
import opportunistProgram from '../programs/opportunist.json';
import opportunistExplorerProgram from '../programs/opportunist-explorer.json';
import opportunistWandererProgram from '../programs/opportunist-wanderer.json';
import opportunistAvoiderProgram from '../programs/opportunist-avoider.json';
import minimalistProgram from '../programs/minimalist.json';
import recyclerProgram from '../programs/recycler.json';

// ============================================================
// Constants (UI only)
// ============================================================
const MIN_TPS = 1;
const MAX_TPS = 60;
const DEFAULT_TPS = 5;
const INITIAL_ENERGY = 5000;
const DEFAULT_SEED = 42;
const INITIAL_COUNT = 3;
const MAX_SAVED_EVENTS = 10;

// ============================================================
// State
// ============================================================
type Selection =
  | { kind: 'character'; id: string }
  | { kind: 'resourceNode'; id: string }
  | { kind: 'energyNode'; id: string }
  | { kind: 'remains'; id: string }
  | { kind: 'ground'; cellX: number; cellY: number }
  | null;

interface UIState {
  world: World;
  running: boolean;
  ticksPerSecond: number;
  selection: Selection;
  totalBirths: number;
  totalDeaths: number;
  characterActions: ReadonlyMap<string, Action>;
  sessionStartedAt: string;
  resumedAt: string | null;
  recentSavedEvents: SavedEvent[];
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
    ...(r.set_registers ? { set_registers: r.set_registers } : {}),
  }));
  const components: ComponentType[] = json.components ?? [...MIN_COMPONENTS];
  const name = json.name ?? 'Unknown';
  return {
    name,
    components,
    program: { name, rules },
    count: INITIAL_COUNT,
  };
}

function loadProgramWithCount(json: any, count: number): ProgramDef {
  return { ...loadProgram(json), count };
}

const PROGRAM_DEFS: ProgramDef[] = [
  loadProgram(selfReplicatorProgram),
  loadProgram(selfReplicatorExplorerProgram),
  loadProgram(selfReplicatorWandererProgram),
  loadProgram(selfReplicatorAvoiderProgram),
  loadProgram(scavengerProgram),
  loadProgram(scavengerExplorerProgram),
  loadProgram(scavengerWandererProgram),
  loadProgram(scavengerAvoiderProgram),
  loadProgram(opportunistProgram),
  loadProgram(opportunistExplorerProgram),
  loadProgram(opportunistWandererProgram),
  loadProgram(opportunistAvoiderProgram),
  loadProgramWithCount(minimalistProgram, 6),
  loadProgramWithCount(recyclerProgram, 3),
];

// ============================================================
// Engine (mutable — replaced on load)
// ============================================================
let engine: Engine = createEngine(DEFAULT_GAME_PARAMS);

function createInitialState(seed?: number): UIState {
  const rng = createRng(seed ?? DEFAULT_SEED);
  let world = engine.createWorld(DEFAULT_WORLD_CONFIG, rng);

  let firstCharId: string | null = null;

  for (const def of PROGRAM_DEFS) {
    for (let i = 0; i < def.count; i++) {
      const pos: Position = {
        x: 1 + rng() * (world.width - 2),
        y: 1 + rng() * (world.height - 2),
      };
      const id = `char-${String(world.nextCharacterId).padStart(3, '0')}`;
      world = { ...world, nextCharacterId: world.nextCharacterId + 1 };
      const character = engine.createCharacter(id, pos, [...def.components], def.program, INITIAL_ENERGY, def.name, 0);
      world = addCharacter(world, character);
      if (!firstCharId) firstCharId = id;
    }
  }

  return {
    world,
    running: false,
    ticksPerSecond: DEFAULT_TPS,
    selection: firstCharId ? { kind: 'character', id: firstCharId } : null,
    totalBirths: 0,
    totalDeaths: 0,
    characterActions: new Map(),
    sessionStartedAt: formatTimestamp(new Date()),
    resumedAt: null,
    recentSavedEvents: [],
  };
}

let state = createInitialState();
let timerId: ReturnType<typeof setInterval> | null = null;

// ============================================================
// DOM elements
// ============================================================
const canvasContainer = document.getElementById('canvas-container')!;
const btnReset = document.getElementById('btn-reset')!;
const btnFit = document.getElementById('btn-fit')!;
const btnPlayPause = document.getElementById('btn-play-pause')!;
const btnSpeedDown = document.getElementById('btn-speed-down')!;
const btnSpeedUp = document.getElementById('btn-speed-up')!;
const btnSave = document.getElementById('btn-save')!;
const btnLoad = document.getElementById('btn-load')!;
const speedDisplay = document.getElementById('speed-display')!;
const tickDisplay = document.getElementById('tick-display')!;
const statCharacters = document.getElementById('stat-characters')!;
const statBirths = document.getElementById('stat-births')!;
const statDeaths = document.getElementById('stat-deaths')!;
const statRemains = document.getElementById('stat-remains')!;
const statOldest = document.getElementById('stat-oldest')!;
const statSpecies = document.getElementById('stat-species')!;
const selectedContent = document.getElementById('selected-content')!;
const eventLogContent = document.getElementById('event-log-content')!;
const btnStep = document.getElementById('btn-step')! as HTMLButtonElement;
const versionDisplay = document.getElementById('version-display')!;
versionDisplay.textContent = `v${GAME_VERSION}`;

// Hidden file input for load
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.json';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);

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
        else if (hit.kind === 'ground') {
          const { gridWidth, gridHeight } = groundGridDimensions(state.world);
          const { cellX, cellY } = positionToCell(hit.position, gridWidth, gridHeight);
          selection = { kind: 'ground', cellX, cellY };
        }
      }
      state = { ...state, selection };
      render();
    },
    () => state.world,
    () => render(),
  );

  speedDisplay.textContent = String(state.ticksPerSecond);
  render();
}

// ============================================================
// Simulation step
// ============================================================
function step(): void {
  const prevWorld = state.world;
  const result = engine.executeTick(state.world);

  let births = 0;
  let deaths = 0;
  for (const event of result.events) {
    if (event.type === 'character_spawned') births++;
    if (event.type === 'character_died') deaths++;
  }

  // Track recent events for save
  const newSavedEvents: SavedEvent[] = result.events.map((event) => ({
    tick: result.world.tick,
    event,
  }));
  const allSavedEvents = [...state.recentSavedEvents, ...newSavedEvents];
  const recentSavedEvents = allSavedEvents.slice(-MAX_SAVED_EVENTS);

  state = {
    ...state,
    world: result.world,
    totalBirths: state.totalBirths + births,
    totalDeaths: state.totalDeaths + deaths,
    characterActions: result.actions,
    recentSavedEvents,
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

function updatePlayPauseUI(): void {
  btnPlayPause.textContent = state.running ? '⏸' : '▶';
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
function getDrawSelection(): DrawSelection {
  return state.selection;
}

function getSelectedPosition(): Position | null {
  if (!state.selection) return null;
  const sel = state.selection;
  if (sel.kind === 'character') {
    const c = state.world.characters.find((ch) => ch.id === sel.id);
    return c?.position ?? null;
  }
  if (sel.kind === 'resourceNode') {
    const n = state.world.resourceNodes.find((rn) => rn.id === sel.id);
    return n?.position ?? null;
  }
  if (sel.kind === 'energyNode') {
    const n = state.world.energyNodes.find((en) => en.id === sel.id);
    return n?.position ?? null;
  }
  if (sel.kind === 'remains') {
    const r = state.world.remains.find((rm) => rm.id === sel.id);
    return r?.position ?? null;
  }
  if (sel.kind === 'ground') {
    return { x: sel.cellX + 0.5, y: sel.cellY + 0.5 };
  }
  return null;
}

function panToSelection(): void {
  const pos = getSelectedPosition();
  if (pos) renderer.panToIfOffscreen(pos);
}

function render(): void {
  renderer.draw(state.world, getDrawSelection());
  updateStats();
  updateSelected();
}

function updateStats(): void {
  tickDisplay.textContent = `Tick: ${state.world.tick}`;
  statCharacters.textContent = String(state.world.characters.length);
  statBirths.textContent = String(state.totalBirths);
  statDeaths.textContent = String(state.totalDeaths);
  statRemains.textContent = String(state.world.remains.length);

  // Oldest character
  statOldest.innerHTML = '';
  if (state.world.characters.length > 0) {
    let oldest = state.world.characters[0];
    for (const c of state.world.characters) {
      if ((state.world.tick - c.createdAt) > (state.world.tick - oldest.createdAt)) oldest = c;
    }
    const age = state.world.tick - oldest.createdAt;
    const div = document.createElement('div');
    div.textContent = `Oldest: ${age} ticks (${oldest.species})`;
    div.style.cursor = 'pointer';
    div.addEventListener('click', () => {
      state.selection = { kind: 'character', id: oldest.id };
      updateSelected();
    });
    statOldest.appendChild(div);
  }

  const counts = new Map<string, number>();
  for (const c of state.world.characters) {
    counts.set(c.species, (counts.get(c.species) ?? 0) + 1);
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
    const mass = engine.recipeEngine.calculateMass(char.components, char.inventory);
    const invEntries = Object.entries(char.inventory).filter(([, v]) => v > 0);
    const invText = invEntries.length > 0
      ? invEntries.map(([k, v]) => `${k}: ${v}`).join(', ')
      : 'empty';

    const age = state.world.tick - char.createdAt;
    selectedContent.innerHTML = `
      <div><strong>${char.id}</strong> ${isActive(char) ? '(active)' : '(inactive)'}</div>
      <div>Species: ${char.species}</div>
      <div>Age: ${age} ticks</div>
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
      <div>Created: tick ${node.createdAt}</div>
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
      <div>Created: tick ${node.createdAt}</div>
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
    const elapsed = state.world.tick - rem.createdAt;
    const ticksLeft = Math.max(0, engine.params.remainsAbsorptionTicks - elapsed);
    selectedContent.innerHTML = `
      <div><strong>Remains</strong></div>
      <div>Pos: (${rem.position.x.toFixed(1)}, ${rem.position.y.toFixed(1)})</div>
      <div>Absorption: ${ticksLeft} ticks</div>
      <div>Components: ${rem.components.join(', ')}</div>
      <div>Inventory: ${invText}</div>
    `;
    return;
  }

  if (sel.kind === 'ground') {
    const { gridWidth } = groundGridDimensions(state.world);
    const idx = sel.cellY * gridWidth + sel.cellX;
    const cell = state.world.groundGrid[idx];
    if (!cell) { selectedContent.innerHTML = '<em>Click an object</em>'; return; }
    selectedContent.innerHTML = `
      <div><strong>Ground (${sel.cellX}, ${sel.cellY})</strong></div>
      <div>Ore: ${cell.ore}</div>
      <div>Crystal: ${cell.crystal}</div>
    `;
    return;
  }
}

function getSpecies(world: World, charId: string): string {
  const char = world.characters.find((c) => c.id === charId);
  return char?.species ?? '?';
}

function appendEvents(events: readonly SimulationEvent[], tick: number, oldWorld: World, newWorld: World): void {
  const loggedExtinctions = new Set<string>();

  for (const event of events) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    if (event.type === 'character_spawned') {
      const species = getSpecies(newWorld, event.childId);
      div.textContent = `[tick ${tick}] ${event.parentId} spawned ${event.childId} (${species})`;
      div.classList.add('log-birth');
    } else {
      const deadChar = oldWorld.characters.find((c) => c.id === event.id);
      const species = deadChar?.species ?? '?';
      const age = deadChar ? tick - deadChar.createdAt : 0;
      div.textContent = `[tick ${tick}] ${event.id} (${species}) died (age ${age})`;
      div.classList.add('log-death');

      // Extinction check: no survivors of this species in newWorld
      if (!loggedExtinctions.has(species) && !newWorld.characters.some((c) => c.species === species)) {
        loggedExtinctions.add(species);
        const extinctDiv = document.createElement('div');
        extinctDiv.className = 'log-entry log-extinction';
        extinctDiv.textContent = `[tick ${tick}] *** ${species} is now EXTINCT ***`;
        eventLogContent.appendChild(div);
        eventLogContent.appendChild(extinctDiv);
        continue;
      }
    }
    eventLogContent.appendChild(div);
  }
  eventLogContent.scrollTop = eventLogContent.scrollHeight;
}

// ============================================================
// Save / Load
// ============================================================
function saveGame(): void {
  const data: SaveData = {
    version: GAME_VERSION.toString(),
    sessionStartedAt: state.sessionStartedAt,
    params: engine.params,
    world: state.world,
    stats: {
      totalBirths: state.totalBirths,
      totalDeaths: state.totalDeaths,
    },
    recentEvents: state.recentSavedEvents,
  };

  const json = serialize(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const fileName = buildSaveFileName(state.sessionStartedAt, state.resumedAt, state.world.tick);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function loadGame(): void {
  fileInput.click();
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = deserialize(reader.result as string);

      // Re-create engine with loaded params
      engine = createEngine(data.params);

      // Restore state
      const wasRunning = state.running;
      if (wasRunning) {
        stopTimer();
      }

      state = {
        world: data.world,
        running: false,
        ticksPerSecond: state.ticksPerSecond,
        selection: null,
        totalBirths: data.stats.totalBirths,
        totalDeaths: data.stats.totalDeaths,
        characterActions: new Map(),
        sessionStartedAt: data.sessionStartedAt,
        resumedAt: formatTimestamp(new Date()),
        recentSavedEvents: [...data.recentEvents],
      };

      // Restore event log from saved events
      eventLogContent.innerHTML = '';
      for (const se of data.recentEvents) {
        const div = document.createElement('div');
        div.className = 'log-entry';
        if (se.event.type === 'character_spawned') {
          div.textContent = `[tick ${se.tick}] ${se.event.parentId} spawned ${se.event.childId}`;
          div.classList.add('log-birth');
        } else {
          div.textContent = `[tick ${se.tick}] ${se.event.id} died`;
          div.classList.add('log-death');
        }
        eventLogContent.appendChild(div);
      }

      renderer.resetView(state.world.width, state.world.height);
      updatePlayPauseUI();
      render();
    } catch (e: any) {
      alert(e.message);
    }
  };
  reader.readAsText(file);
  fileInput.value = '';
});

// ============================================================
// Reset
// ============================================================
function resetWithRandomSeed(): void {
  stopTimer();
  engine = createEngine(DEFAULT_GAME_PARAMS);
  const seed = Date.now() ^ (Math.random() * 0xffffffff);
  state = createInitialState(seed);
  renderer.resetView(state.world.width, state.world.height);
  updatePlayPauseUI();
  eventLogContent.innerHTML = '';
  render();
}

// ============================================================
// Event listeners
// ============================================================
btnReset.addEventListener('click', resetWithRandomSeed);
btnFit.addEventListener('click', () => {
  renderer.resetView(state.world.width, state.world.height);
  render();
});
btnPlayPause.addEventListener('click', toggleRunning);
btnSpeedDown.addEventListener('click', () => setSpeed(state.ticksPerSecond - 1));
btnSpeedUp.addEventListener('click', () => setSpeed(state.ticksPerSecond + 1));
btnStep.addEventListener('click', () => {
  if (!state.running) step();
});
btnSave.addEventListener('click', saveGame);
btnLoad.addEventListener('click', loadGame);
statSpecies.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const species = target.dataset?.species;
  if (!species) return;
  const members = state.world.characters.filter((c) => c.species === species);
  if (members.length === 0) return;
  const currentId = state.selection?.kind === 'character' ? state.selection.id : null;
  const currentIdx = currentId ? members.findIndex((c) => c.id === currentId) : -1;
  const next = currentIdx >= 0 ? members[(currentIdx + 1) % members.length] : members[0];
  state = { ...state, selection: { kind: 'character', id: next.id } };
  panToSelection();
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
