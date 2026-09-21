/**
 * GUI メインループ。実験を選んで実行・再生し、世界の状態と個体群メトリクスを表示する。
 */

import { EXPERIMENTS, experimentById } from '@/experiments.js';
import type { Experiment } from '@/experiments.js';
import type { GameParams } from '@/params.js';
import { createRng } from '@/rng.js';
import type { Rng } from '@/rng.js';
import { formatAtomTotals, totalAtoms, totalEnergy } from '@/sim/accounting.js';
import { buildInitialWorld } from '@/sim/initial-state.js';
import { executeTick } from '@/sim/simulation.js';
import type { ComponentObject, ProcessorComponent, World } from '@/sim/types.js';
import { isWreck } from '@/sim/types.js';
import { GAME_VERSION } from '@/version.js';
import { renderEncoding, renderLegend } from './legend.js';
import { classColor, Renderer, surfaceTokens } from './renderer.js';
import type { Selection } from './renderer.js';

const MIN_TPS = 1;
const MAX_TPS = 240;
const DEFAULT_TPS = 30;

interface State {
  experiment: Experiment;
  seed: number;
  params: GameParams;
  world: World;
  rng: Rng;
  running: boolean;
  tps: number;
  selection: Selection;
  births: number;
  deaths: number;
}

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} が見つからない`);
  return el;
};

const renderer = new Renderer();
let state: State = init(EXPERIMENTS[0], EXPERIMENTS[0].defaultSeed);
let timer: number | null = null;

function init(experiment: Experiment, seed: number, tps: number = DEFAULT_TPS): State {
  const rng = createRng(seed);
  const world = buildInitialWorld(experiment.build(seed), experiment.params, rng);
  return {
    experiment,
    seed,
    params: experiment.params,
    world,
    rng,
    running: false,
    tps,
    selection: null,
    births: 0,
    deaths: 0,
  };
}

// === シミュレーション ===

function step(): void {
  const result = executeTick(state.world, state.params, state.rng);
  let births = 0;
  let deaths = 0;
  for (const e of result.events) {
    if (e.type === 'processor_started') births += 1;
    if (e.type === 'component_wrecked' && e.componentType === 'Processor') deaths += 1;
  }
  state = { ...state, world: result.world, births: state.births + births, deaths: state.deaths + deaths };
  if (state.selection !== null && !result.world.objects.some(o => o.id === state.selection!.id)) {
    state = { ...state, selection: null };
  }
  draw();
}

function startTimer(): void {
  stopTimer();
  timer = window.setInterval(step, Math.max(4, Math.round(1000 / state.tps)));
}
function stopTimer(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}
function toggleRun(): void {
  state = { ...state, running: !state.running };
  if (state.running) startTimer();
  else stopTimer();
  ($('btn-play') as HTMLButtonElement).textContent = state.running ? '⏸ 停止' : '▶ 再生';
  ($('btn-step') as HTMLButtonElement).disabled = state.running;
}

function reset(): void {
  stopTimer();
  state = init(state.experiment, state.seed, state.tps);
  renderer.resetView(state.world.width, state.world.height);
  ($('btn-play') as HTMLButtonElement).textContent = '▶ 再生';
  ($('btn-step') as HTMLButtonElement).disabled = false;
  draw();
}

// === 描画とメトリクス ===

interface Census {
  mobile: number;
  sedentary: number;
  predator: number;
  byType: Map<string, { active: number; wreck: number }>;
  groups: number;
  spread: number;
}

function census(world: World): Census {
  const byType = new Map<string, { active: number; wreck: number }>();
  let mobile = 0;
  let sedentary = 0;
  let predator = 0;
  let groups = 0;
  const mobilePos: { x: number; y: number }[] = [];
  for (const obj of world.objects) {
    if (obj.kind === 'component') {
      const entry = byType.get(obj.componentType) ?? { active: 0, wreck: 0 };
      if (isWreck(obj)) entry.wreck += 1;
      else entry.active += 1;
      byType.set(obj.componentType, entry);
    } else if (obj.kind === 'group') {
      groups += 1;
      const members = obj.memberIds
        .map(id => world.objects.find(o => o.id === id))
        .filter((m): m is ComponentObject => m !== undefined && m.kind === 'component' && !isWreck(m));
      const alive = members.some(m => m.componentType === 'Processor' && (m as ProcessorComponent).running);
      if (!alive) continue;
      const types = new Set(members.map(m => m.componentType));
      if (types.has('Disassembler')) predator += 1;
      else if (types.has('Actuator')) {
        mobile += 1;
        mobilePos.push(obj.position);
      } else sedentary += 1;
    }
  }
  let spread = 0;
  for (let i = 0; i < mobilePos.length; i++) {
    for (let j = i + 1; j < mobilePos.length; j++) {
      spread = Math.max(spread, Math.hypot(mobilePos[i].x - mobilePos[j].x, mobilePos[i].y - mobilePos[j].y));
    }
  }
  return { mobile, sedentary, predator, byType, groups, spread };
}

function draw(): void {
  renderer.setSelection(state.selection);
  renderer.draw(state.world, state.selection);
  const c = census(state.world);
  const w = state.world;

  $('tick').textContent = `tick ${w.tick}`;
  const speciesRows = [
    c.mobile > 0 ? `<span class="dot" style="background:${classColor('mover')}"></span>移動種: <b>${c.mobile}</b>` : '',
    c.sedentary > 0 ? `<span class="dot" style="background:${classColor('settler')}"></span>定住種: <b>${c.sedentary}</b>` : '',
    c.predator > 0 ? `<span class="dot" style="background:${classColor('predator')}"></span>捕食者: <b>${c.predator}</b>` : '',
  ].filter(Boolean).join('<br>');
  const typeRows = [...c.byType.entries()]
    .sort()
    .map(([t, e]) => `${t}: ${e.active}${e.wreck > 0 ? ` <span class="wreck">(残骸${e.wreck})</span>` : ''}`)
    .join('<br>');

  $('metrics').innerHTML = `
    <div class="metric-group"><h4>個体（種）</h4>${speciesRows || '<em>なし</em>'}</div>
    <div class="metric-group"><h4>個体群</h4>
      グループ: ${c.groups}<br>
      ${c.mobile > 1 ? `移動種の拡散: ${c.spread.toFixed(0)}<br>` : ''}
      誕生(累計): ${state.births} / 死亡(累計): ${state.deaths}
    </div>
    <div class="metric-group"><h4>コンポーネント</h4>${typeRows || '<em>なし</em>'}</div>
    <div class="metric-group"><h4>資源</h4>
      MatterNode: ${w.objects.filter(o => o.kind === 'matterNode').length}<br>
      EnergyNode: ${w.objects.filter(o => o.kind === 'energyNode').length}<br>
      地面の散布物: ${w.objects.filter(o => o.kind === 'ground').length}
    </div>
    <div class="metric-group"><h4>保存量</h4>
      <span class="mono">${formatAtomTotals(totalAtoms(w))}</span><br>
      蓄積エネルギー: ${totalEnergy(w)}
    </div>
  `;

  drawSelected();
}

function drawSelected(): void {
  const panel = $('selected');
  if (state.selection === null) {
    panel.innerHTML = '<em>個体や資源をクリックすると詳細が出ます</em>';
    return;
  }
  const obj = state.world.objects.find(o => o.id === state.selection!.id);
  if (obj === undefined) {
    panel.innerHTML = '<em>（消滅しました）</em>';
    return;
  }
  if (obj.kind === 'group') {
    const rows = obj.memberIds.map(id => {
      const m = state.world.objects.find(o => o.id === id);
      if (m === undefined || m.kind !== 'component') return `<li>${id}</li>`;
      const wreck = isWreck(m) ? ' <span class="wreck">残骸</span>' : '';
      const run = m.componentType === 'Processor' ? ((m as ProcessorComponent).running ? ' [稼働]' : ' [停止]') : '';
      return `<li>${m.componentType} #${id} 耐久${m.durability}${run}${wreck}</li>`;
    }).join('');
    panel.innerHTML = `<b>個体（グループ #${obj.id}）</b><br>位置 (${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)})<br>${obj.memberIds.length}部品<ul>${rows}</ul>`;
  } else if (obj.kind === 'component') {
    panel.innerHTML = `<b>${obj.componentType} #${obj.id}</b><br>位置 (${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)})<br>耐久 ${obj.durability} / 修理 ${obj.repairCount}回`;
  } else if (obj.kind === 'matterNode') {
    const s = obj.substanceCode;
    panel.innerHTML = `<b>資源ノード #${obj.id}</b><br>物質コード ${s}<br>残量 ${obj.remaining}`;
  } else if (obj.kind === 'energyNode') {
    panel.innerHTML = `<b>エネルギーノード #${obj.id}</b>`;
  } else if (obj.kind === 'ground') {
    panel.innerHTML = `<b>散布物 #${obj.id}</b><br>物質コード ${obj.substanceCode} × ${obj.count}`;
  }
}

// === UI 構築 ===

function buildControls(): void {
  const select = $('experiment') as HTMLSelectElement;
  for (const exp of EXPERIMENTS) {
    const opt = document.createElement('option');
    opt.value = exp.id;
    opt.textContent = exp.label;
    select.appendChild(opt);
  }
  select.value = state.experiment.id;
  $('exp-desc').textContent = state.experiment.description;
  ($('seed') as HTMLInputElement).value = String(state.seed);
  ($('speed') as HTMLInputElement).value = String(state.tps);
  $('speed-val').textContent = String(state.tps);
  $('version').textContent = `v${GAME_VERSION.toString()}`;

  select.addEventListener('change', () => {
    stopTimer();
    const exp = experimentById(select.value);
    state = { ...init(exp, exp.defaultSeed), tps: state.tps };
    ($('seed') as HTMLInputElement).value = String(state.seed);
    $('exp-desc').textContent = exp.description;
    ($('btn-play') as HTMLButtonElement).textContent = '▶ 再生';
    renderer.resetView(state.world.width, state.world.height);
    draw();
  });
  ($('seed') as HTMLInputElement).addEventListener('change', e => {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) {
      state = { ...state, seed: Math.trunc(v) };
      reset();
    }
  });
  $('btn-play').addEventListener('click', toggleRun);
  $('btn-step').addEventListener('click', () => {
    if (!state.running) step();
  });
  $('btn-reset').addEventListener('click', reset);
  $('btn-fit').addEventListener('click', () => {
    renderer.resetView(state.world.width, state.world.height);
    draw();
  });
  const speed = $('speed') as HTMLInputElement;
  speed.addEventListener('input', () => {
    state = { ...state, tps: Math.max(MIN_TPS, Math.min(MAX_TPS, Number(speed.value))) };
    $('speed-val').textContent = String(state.tps);
    if (state.running) startTimer();
  });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'SELECT') {
      e.preventDefault();
      toggleRun();
    }
  });
}

/** 面のトークンを CSS 変数へ。style.css は色を1つも持たず、これを受けるだけ */
function applySurface(): void {
  const style = document.documentElement.style;
  style.setProperty('--surface-base', surfaceTokens.base);
  style.setProperty('--surface-panel', surfaceTokens.panel);
  style.setProperty('--surface-line', surfaceTokens.line);
  style.setProperty('--ink', surfaceTokens.ink);
  style.setProperty('--ink-dim', surfaceTokens.inkDim);
}

function main(): void {
  applySurface();
  renderLegend($('legend-body'));
  renderEncoding($('encoding-body'));
  renderer.init($('canvas-container'));
  renderer.onSelectChanged(sel => {
    state = { ...state, selection: sel };
    draw();
  });
  buildControls();
  renderer.resetView(state.world.width, state.world.height);
  draw();
}

main();
