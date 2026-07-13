/**
 * Assemblerのアクション処理（SET_RECIPE / CRAFT / ASSEMBLE / REPAIR）。
 * 仕様: docs/specs/02_components.md, 04_craft_energy.md
 */

import type { GameParams } from '../params';
import type { Recipe } from '../craft/types';
import { recipeByCode, substanceCodeOf, REPAIR_MATERIAL, SUBSTANCE_MAP } from './codes';
import { createComponent, withOpmemPatch } from './components';
import { damageComponent } from './lifecycle';
import {
  ASM_OFF_ACTION_TRIGGER,
  ASM_OFF_CONFIGURED_RECIPE,
  ASM_OFF_CONNECTION_EDGE,
  ASM_OFF_CONNECTION_TARGET,
  ASM_OFF_LAST_PRODUCT,
  ASM_OFF_PROGRESS,
  ASM_OFF_RECIPE_CODE,
  ASM_OFF_REPAIR_TARGET,
  ASM_OFF_RESULT,
  ASM_OFF_STATUS,
  ASM_TRIGGER_ASSEMBLE,
  ASM_TRIGGER_CRAFT,
  ASM_TRIGGER_REPAIR,
  ASM_TRIGGER_SET_RECIPE,
  EDGE_AUTO,
  RESULT_EDGE_OCCUPIED,
  RESULT_INVALID,
  RESULT_NO_ENERGY,
  RESULT_NO_MATERIAL,
  RESULT_SUCCESS,
  RESULT_UNREACHABLE,
} from './opmem';
import {
  depositEnergy,
  depositOrDrop,
  dropItems,
  groupEnergy,
  groupItemCount,
  withdrawEnergy,
  withdrawItems,
} from './storage';
import type { AssemblerComponent, ComponentObject, SimulationEvent, World } from './types';
import { isWreck } from './types';
import {
  attachToTargetGroup,
  effectivePosition,
  getComponent,
  inSameGroup,
  isAccessible,
  nextObjectId,
  oppositeEdge,
  replaceObject,
} from './world';

export const craftTicksFor = (recipe: Recipe, params: GameParams): number => {
  if (recipe.kind === 'component') return params.craftTicksComponent;
  const hasIntermediateOutput = recipe.outputs.some(
    output => SUBSTANCE_MAP.get(output.substanceId)?.tier === 'intermediate',
  );
  return hasIntermediateOutput ? params.craftTicksIntermediate : params.craftTicksBase;
};

/** 材料とエネルギーの事前チェック（all-or-nothing のため） */
const canAfford = (
  world: World,
  assemblerId: number,
  recipe: Recipe,
): 'ok' | 'no_material' | 'no_energy' => {
  for (const input of recipe.inputs) {
    if (groupItemCount(world, assemblerId, substanceCodeOf(input.substanceId)) < input.count) {
      return 'no_material';
    }
  }
  if (recipe.energyCost > 0 && groupEnergy(world, assemblerId) < recipe.energyCost) {
    return 'no_energy';
  }
  return 'ok';
};

const consumeInputs = (world: World, assemblerId: number, recipe: Recipe): World => {
  let w = world;
  for (const input of recipe.inputs) {
    w = withdrawItems(w, assemblerId, substanceCodeOf(input.substanceId), input.count).world;
  }
  if (recipe.energyCost > 0) {
    w = withdrawEnergy(w, assemblerId, recipe.energyCost).world;
  }
  return w;
};

const finish = (
  world: World,
  assembler: AssemblerComponent,
  patch: ReadonlyArray<readonly [number, number]>,
  changes: Partial<AssemblerComponent>,
): World => {
  const current = getComponent(world, assembler.id);
  if (current === undefined || current.componentType !== 'Assembler') return world;
  const updated = withOpmemPatch({ ...current, ...changes } as AssemblerComponent, patch);
  return replaceObject(world, updated);
};

/** クラフト完了: 生成物をStorageへ（不足分は散布）、負コストは充填 */
const completeCraft = (
  world: World,
  assembler: AssemblerComponent,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const recipe = recipeByCode(assembler.configuredRecipe);
  if (recipe === undefined) return world;
  const position = effectivePosition(world, assembler);
  let w = world;
  for (const output of recipe.outputs) {
    w = depositOrDrop(w, assembler.id, position, substanceCodeOf(output.substanceId), output.count, params);
  }
  if (recipe.energyCost < 0) {
    w = depositEnergy(w, assembler.id, -recipe.energyCost, params).world;
  }
  events.push({ type: 'craft_completed', assemblerId: assembler.id, recipeCode: assembler.configuredRecipe });
  return finish(w, assembler, [
    [ASM_OFF_STATUS, 0],
    [ASM_OFF_PROGRESS, 0],
    [ASM_OFF_RESULT, RESULT_SUCCESS],
  ], { phase: 'idle', ticksRemaining: 0 });
};

/** 組立完了: コンポーネントを生成し、接続または自由設置する */
const completeAssemble = (
  world: World,
  assembler: AssemblerComponent,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const recipe = recipeByCode(assembler.configuredRecipe);
  if (recipe === undefined) return world;
  const outputId = recipe.outputs[0]?.substanceId;
  const componentType = outputId as ComponentObject['componentType'];
  const position = effectivePosition(world, assembler);

  const { id, world: w1 } = nextObjectId(world);
  // 自由設置の方位は設置ごとに60°回転する（同じ場所に積み上げて衝突が連鎖するのを防ぐ）
  const spawnAngle = (assembler.spawnCount % 6) * (Math.PI / 3);
  const spawnPos = {
    x: position.x + params.spawnOffset * Math.cos(spawnAngle),
    y: position.y + params.spawnOffset * Math.sin(spawnAngle),
  };
  const newComponent = createComponent(id, componentType, spawnPos, params);

  const targetRawId = assembler.opmem[ASM_OFF_CONNECTION_TARGET];
  const edgeSpec = assembler.opmem[ASM_OFF_CONNECTION_EDGE];

  let w: World = { ...w1, objects: [...w1.objects, newComponent] };
  let result = RESULT_SUCCESS;
  let placedFreestanding = targetRawId === 0;

  const target = targetRawId !== 0 ? getComponent(w, targetRawId) : undefined;
  if (targetRawId !== 0 && (target === undefined || !isAccessible(w, assembler.id, targetRawId, params.proximityRange))) {
    result = RESULT_UNREACHABLE; // 自由設置にフォールバック
    placedFreestanding = true;
  } else if (target !== undefined) {
    const targetEdge =
      edgeSpec === EDGE_AUTO ? target.edges.findIndex(peer => peer === null) : edgeSpec;
    if (targetEdge < 0 || targetEdge >= 6 || target.edges[targetEdge] !== null) {
      result = RESULT_EDGE_OCCUPIED; // 自由設置にフォールバック
      placedFreestanding = true;
    } else {
      const newEdge = oppositeEdge(targetEdge);
      w = replaceObject(w, {
        ...target,
        edges: target.edges.map((peer, i) => (i === targetEdge ? id : peer)),
      });
      const created = getComponent(w, id)!;
      w = replaceObject(w, {
        ...created,
        edges: created.edges.map((peer, i) => (i === newEdge ? targetRawId : peer)),
      });
      w = attachToTargetGroup(w, id, targetRawId);
    }
  }

  events.push({ type: 'component_created', id, componentType });
  return finish(w, assembler, [
    [ASM_OFF_STATUS, 0],
    [ASM_OFF_PROGRESS, 0],
    [ASM_OFF_RESULT, result],
    [ASM_OFF_LAST_PRODUCT, id & 0xffff],
  ], {
    phase: 'idle',
    ticksRemaining: 0,
    spawnCount: assembler.spawnCount + (placedFreestanding ? 1 : 0),
  });
};

/** 進行中のフェーズを1tick進める */
const progressAssembler = (
  world: World,
  assembler: AssemblerComponent,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const remaining = assembler.ticksRemaining - 1;
  if (remaining > 0) {
    return finish(world, assembler, [[ASM_OFF_PROGRESS, remaining]], { ticksRemaining: remaining });
  }
  switch (assembler.phase) {
    case 'reconfiguring':
      return finish(world, assembler, [
        [ASM_OFF_STATUS, 0],
        [ASM_OFF_PROGRESS, 0],
        [ASM_OFF_RESULT, RESULT_SUCCESS],
        [ASM_OFF_CONFIGURED_RECIPE, assembler.pendingRecipe],
      ], { phase: 'idle', ticksRemaining: 0, configuredRecipe: assembler.pendingRecipe, pendingRecipe: 0 });
    case 'crafting':
      return completeCraft(world, assembler, params, events);
    case 'assembling':
      return completeAssemble(world, assembler, params, events);
    default:
      return world;
  }
};

const rejectTrigger = (world: World, assembler: AssemblerComponent, result: number): World =>
  finish(world, assembler, [
    [ASM_OFF_ACTION_TRIGGER, 0],
    [ASM_OFF_RESULT, result],
  ], {});

/** REPAIR: 修理コストは修理回数ごとに逓増する */
const executeRepair = (
  world: World,
  assembler: AssemblerComponent,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const targetId = assembler.opmem[ASM_OFF_REPAIR_TARGET];
  const target = getComponent(world, targetId);
  if (target === undefined || isWreck(target) || !inSameGroup(world, assembler.id, targetId)) {
    return rejectTrigger(world, assembler, RESULT_UNREACHABLE);
  }
  const materialCode = substanceCodeOf(REPAIR_MATERIAL[target.componentType]);
  const energyCost = params.repairBaseEnergy * (target.repairCount + 1);
  if (groupItemCount(world, assembler.id, materialCode) < 1) {
    return rejectTrigger(world, assembler, RESULT_NO_MATERIAL);
  }
  if (groupEnergy(world, assembler.id) < energyCost) {
    return rejectTrigger(world, assembler, RESULT_NO_ENERGY);
  }
  let w = withdrawItems(world, assembler.id, materialCode, 1).world;
  w = withdrawEnergy(w, assembler.id, energyCost).world;
  // 修理は新しい材料で摩耗部を置換する。置き換えられた等量の摩耗材はその場に排出される
  // （原子保存: 修理材の原子を消滅させず、地面へ散布する。回収には再度Harvesterが要る）
  w = dropItems(w, effectivePosition(w, assembler), materialCode, 1);
  const repaired = getComponent(w, targetId)!;
  w = replaceObject(w, {
    ...repaired,
    durability: Math.min(params.maxDurability, repaired.durability + params.repairAmount),
    repairCount: repaired.repairCount + 1,
  });
  const self = getComponent(w, assembler.id) as AssemblerComponent;
  const finished = finish(w, self, [
    [ASM_OFF_ACTION_TRIGGER, 0],
    [ASM_OFF_RESULT, RESULT_SUCCESS],
  ], {});
  return damageComponent(finished, assembler.id, 1, events);
};

/** 新規トリガの受理 */
const acceptTrigger = (
  world: World,
  assembler: AssemblerComponent,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const trigger = assembler.opmem[ASM_OFF_ACTION_TRIGGER];

  if (trigger === ASM_TRIGGER_SET_RECIPE) {
    const code = assembler.opmem[ASM_OFF_RECIPE_CODE];
    if (recipeByCode(code) === undefined) return rejectTrigger(world, assembler, RESULT_INVALID);
    const { world: w, paid } = withdrawEnergy(world, assembler.id, params.reconfigEnergy);
    if (!paid) return rejectTrigger(world, assembler, RESULT_NO_ENERGY);
    const started = finish(w, assembler, [
      [ASM_OFF_ACTION_TRIGGER, 0],
      [ASM_OFF_STATUS, 1],
      [ASM_OFF_PROGRESS, params.reconfigTicks],
      [ASM_OFF_RESULT, 0],
    ], {
      phase: 'reconfiguring',
      ticksRemaining: params.reconfigTicks,
      pendingRecipe: code,
    });
    return damageComponent(started, assembler.id, 1, events);
  }

  if (trigger === ASM_TRIGGER_CRAFT || trigger === ASM_TRIGGER_ASSEMBLE) {
    const recipe = recipeByCode(assembler.configuredRecipe);
    if (recipe === undefined) return rejectTrigger(world, assembler, RESULT_INVALID);
    const wantComponent = trigger === ASM_TRIGGER_ASSEMBLE;
    const isComponentRecipe = recipe.kind === 'component';
    if (wantComponent !== isComponentRecipe || recipe.kind === 'disassembly') {
      return rejectTrigger(world, assembler, RESULT_INVALID);
    }
    const affordable = canAfford(world, assembler.id, recipe);
    if (affordable === 'no_material') return rejectTrigger(world, assembler, RESULT_NO_MATERIAL);
    if (affordable === 'no_energy') return rejectTrigger(world, assembler, RESULT_NO_ENERGY);
    const w = consumeInputs(world, assembler.id, recipe);
    const ticks = craftTicksFor(recipe, params);
    const started = finish(w, assembler, [
      [ASM_OFF_ACTION_TRIGGER, 0],
      [ASM_OFF_STATUS, 1],
      [ASM_OFF_PROGRESS, ticks],
      [ASM_OFF_RESULT, 0],
    ], {
      phase: wantComponent ? 'assembling' : 'crafting',
      ticksRemaining: ticks,
    });
    return damageComponent(started, assembler.id, 1, events);
  }

  if (trigger === ASM_TRIGGER_REPAIR) {
    return executeRepair(world, assembler, params, events);
  }

  return rejectTrigger(world, assembler, RESULT_INVALID);
};

export const processAssembler = (
  world: World,
  assemblerId: number,
  params: GameParams,
  events: SimulationEvent[],
): World => {
  const assembler = getComponent(world, assemblerId);
  if (assembler === undefined || assembler.componentType !== 'Assembler' || isWreck(assembler)) {
    return world;
  }
  if (assembler.phase !== 'idle') {
    // 進行中: 新規トリガは拒否して進行を続ける
    const trigger = assembler.opmem[ASM_OFF_ACTION_TRIGGER];
    const w =
      trigger !== 0 ? rejectTrigger(world, assembler, RESULT_INVALID) : world;
    const current = getComponent(w, assemblerId) as AssemblerComponent;
    return progressAssembler(w, current, params, events);
  }
  if (assembler.opmem[ASM_OFF_ACTION_TRIGGER] === 0) return world;
  return acceptTrigger(world, assembler, params, events);
};
