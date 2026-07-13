/**
 * 劣化フェーズ（フェーズ4）と自発変化フェーズ（フェーズ3）。
 * 仕様: docs/specs/02_components.md, 04_craft_energy.md
 */

import type { GameParams } from '../params';
import type { Rng } from '../rng';
import { disassemblyRecipeFor, recipeByCode, substanceCodeOf } from './codes';
import { dropItems, scatterStorageContents } from './storage';
import type { AssemblerComponent, ComponentObject, SimulationEvent, World } from './types';
import { isWreck } from './types';
import {
  allComponents,
  effectivePosition,
  getComponent,
  removeComponentAndRebuild,
  replaceObject,
} from './world';

/**
 * 作業中のAssemblerが抱えている消費済み材料をその場に散布する。
 * 残骸化・分解・崩壊で作業が失われるとき、原子保存を守るために必要。
 */
export const releaseInProgressMaterials = (world: World, component: ComponentObject): World => {
  if (component.componentType !== 'Assembler') return world;
  const assembler = component as AssemblerComponent;
  if (assembler.phase !== 'crafting' && assembler.phase !== 'assembling') return world;
  const recipe = recipeByCode(assembler.configuredRecipe);
  if (recipe === undefined) return world;
  const position = effectivePosition(world, assembler);
  let w = world;
  for (const input of recipe.inputs) {
    w = dropItems(w, position, substanceCodeOf(input.substanceId), input.count);
  }
  return w;
};

/** 耐久度0になったコンポーネントの残骸化処理 */
const wreckify = (world: World, componentId: number, events: SimulationEvent[]): World => {
  const component = getComponent(world, componentId);
  if (component === undefined) return world;
  let w = releaseInProgressMaterials(world, component);
  const current = getComponent(w, componentId);
  if (current === undefined) return w;
  let updated: ComponentObject = current;
  if (updated.componentType === 'Processor') {
    updated = { ...updated, running: false };
  }
  if (updated.componentType === 'Assembler') {
    updated = { ...updated, phase: 'idle', ticksRemaining: 0, pendingRecipe: 0 };
  }
  if (updated.componentType === 'Disassembler') {
    updated = { ...updated, ticksRemaining: 0, targetObjectId: 0 };
  }
  w = replaceObject(w, updated);
  events.push({ type: 'component_wrecked', id: componentId, componentType: component.componentType });
  return w;
};

/**
 * 耐久度を減少させ、0に達したら残骸化する（イベント発行・作業中材料の散布を含む）。
 * 耐久度の減少は必ず本関数を経由すること（残骸化の一貫性のため）。
 */
export const damageComponent = (
  world: World,
  componentId: number,
  amount: number,
  events: SimulationEvent[],
): World => {
  const component = getComponent(world, componentId);
  if (component === undefined || isWreck(component) || amount <= 0) return world;
  const durability = Math.max(0, component.durability - amount);
  const w = replaceObject(world, { ...component, durability });
  return durability === 0 ? wreckify(w, componentId, events) : w;
};

/**
 * 劣化フェーズ: 経年劣化と継続動作の摩耗を適用し、耐久度0を残骸化する。
 * - 経年: AGE_INTERVAL tickごとに全コンポーネント-1
 * - 継続動作: CONTINUOUS_WEAR_INTERVAL tickごとに、当tickに実行された
 *   Processor/作動したActuatorが追加で-1
 */
export const executeDurabilityPhase = (
  world: World,
  params: GameParams,
  executedProcessorIds: ReadonlySet<number>,
  activeActuatorIds: ReadonlySet<number>,
  events: SimulationEvent[],
): World => {
  const ageTick = world.tick % params.ageInterval === 0;
  const continuousTick = world.tick % params.continuousWearInterval === 0;
  let w = world;
  const ids = allComponents(w)
    .map(c => c.id)
    .sort((a, b) => a - b);
  for (const id of ids) {
    const component = getComponent(w, id);
    if (component === undefined || isWreck(component)) continue;
    const continuousActive =
      continuousTick && (executedProcessorIds.has(id) || activeActuatorIds.has(id));
    const wear = (ageTick ? 1 : 0) + (continuousActive ? 1 : 0);
    if (wear === 0) continue;
    w = damageComponent(w, id, wear, events);
  }
  return w;
};

/**
 * 自発変化フェーズ: 残骸がコンポーネント分解（RX）レシピで崩壊する。
 * 対象ごとにID昇順で乱数判定を行う（決定論のため消費順を固定）。
 */
export const executeDecayPhase = (
  world: World,
  params: GameParams,
  rng: Rng,
  events: SimulationEvent[],
): World => {
  let w = world;
  const wreckIds = allComponents(w)
    .filter(isWreck)
    .map(c => c.id)
    .sort((a, b) => a - b);
  for (const id of wreckIds) {
    const roll = rng();
    if (roll >= params.decayProbability) continue;
    const component = getComponent(w, id);
    if (component === undefined) continue;
    const position = effectivePosition(w, component);
    w = releaseInProgressMaterials(w, component);
    if (component.componentType === 'Storage') {
      w = scatterStorageContents(w, id);
    }
    const recipe = disassemblyRecipeFor(component.componentType);
    w = removeComponentAndRebuild(w, id);
    for (const output of recipe.outputs) {
      w = dropItems(w, position, substanceCodeOf(output.substanceId), output.count);
    }
    events.push({
      type: 'component_removed',
      id,
      componentType: component.componentType,
      cause: 'decayed',
    });
  }
  return w;
};
