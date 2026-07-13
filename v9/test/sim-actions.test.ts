import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { recipeCodeOf, substanceCodeOf, TYPE_CODE_SUBSTANCE_BASE } from '../src/sim/codes';
import { withOpmemPatch } from '../src/sim/components';
import {
  ASM_OFF_ACTION_TRIGGER,
  ASM_OFF_CONFIGURED_RECIPE,
  ASM_OFF_CONNECTION_EDGE,
  ASM_OFF_CONNECTION_TARGET,
  ASM_OFF_LAST_PRODUCT,
  ASM_OFF_RECIPE_CODE,
  ASM_OFF_REPAIR_TARGET,
  ASM_OFF_RESULT,
  ASM_TRIGGER_ASSEMBLE,
  ASM_TRIGGER_CRAFT,
  ASM_TRIGGER_REPAIR,
  ASM_TRIGGER_SET_RECIPE,
  EDGE_AUTO,
  HARV_OFF_FILTER,
  HARV_OFF_TRIGGER,
  RESULT_SUCCESS,
} from '../src/sim/opmem';
import { executeTick } from '../src/sim/simulation';
import type { AssemblerComponent, StorageComponent, World } from '../src/sim/types';
import { getComponent, replaceObject } from '../src/sim/world';
import { buildWorld, findComponent, makeParams, minimalAncestorConfig } from './sim-helpers';

const params = makeParams();
const rng = createRng(1);

/** opmemへ直接書いてtickを回す（プログラムを介さないアクション検証用） */
const poke = (world: World, componentId: number, patch: Array<readonly [number, number]>): World => {
  const component = getComponent(world, componentId);
  if (component === undefined) throw new Error('component not found');
  return replaceObject(world, withOpmemPatch(component, patch));
};

const tick = (world: World, times = 1): World => {
  let w = world;
  for (let i = 0; i < times; i++) {
    w = executeTick(w, params, rng).world;
  }
  return w;
};

describe('Assembler', () => {
  it('SET_RECIPE → CRAFT で R1 が実行され、生成物がStorageへ入る', () => {
    let w = buildWorld(minimalAncestorConfig([], 1000));
    const assembler = findComponent(w, 'Assembler');
    const storage = findComponent(w, 'Storage') as StorageComponent;

    // 材料を直接Storageへ入れる
    const items = new Map(storage.items);
    items.set(substanceCodeOf('BaseSolid'), 1);
    items.set(substanceCodeOf('BindingShard'), 2);
    w = replaceObject(w, { ...storage, items });

    // SET_RECIPE(R1)
    w = poke(w, assembler.id, [
      [ASM_OFF_RECIPE_CODE, recipeCodeOf('R1')],
      [ASM_OFF_ACTION_TRIGGER, ASM_TRIGGER_SET_RECIPE],
    ]);
    w = tick(w, params.reconfigTicks + 1);
    const configured = getComponent(w, assembler.id) as AssemblerComponent;
    expect(configured.configuredRecipe).toBe(recipeCodeOf('R1'));
    expect(configured.opmem[ASM_OFF_CONFIGURED_RECIPE]).toBe(recipeCodeOf('R1'));

    // CRAFT
    w = poke(w, assembler.id, [[ASM_OFF_ACTION_TRIGGER, ASM_TRIGGER_CRAFT]]);
    w = tick(w, params.craftTicksBase + 1);

    const storageAfter = getComponent(w, storage.id) as StorageComponent;
    expect(storageAfter.items.get(substanceCodeOf('DenseMatrix'))).toBe(1);
    expect(storageAfter.items.get(substanceCodeOf('FlexibleChain'))).toBe(1);
    expect(storageAfter.items.get(substanceCodeOf('BaseSolid'))).toBeUndefined();
  });

  it('ASSEMBLE でコンポーネントが生成され、指定辺に接続される', () => {
    let w = buildWorld(minimalAncestorConfig([], 1000));
    const assembler = findComponent(w, 'Assembler');
    const storage = findComponent(w, 'Storage') as StorageComponent;

    // Storageの材料（RC8: ReinforcedMatrix + DenseMatrix → Storage）
    const items = new Map(storage.items);
    items.set(substanceCodeOf('ReinforcedMatrix'), 1);
    items.set(substanceCodeOf('DenseMatrix'), 1);
    w = replaceObject(w, { ...storage, items });

    w = poke(w, assembler.id, [
      [ASM_OFF_RECIPE_CODE, recipeCodeOf('RC8')],
      [ASM_OFF_ACTION_TRIGGER, ASM_TRIGGER_SET_RECIPE],
    ]);
    w = tick(w, params.reconfigTicks + 1);

    // Assemblerの空き辺（辺2側）に接続する
    w = poke(w, assembler.id, [
      [ASM_OFF_CONNECTION_TARGET, assembler.id],
      [ASM_OFF_CONNECTION_EDGE, 2],
      [ASM_OFF_ACTION_TRIGGER, ASM_TRIGGER_ASSEMBLE],
    ]);
    w = tick(w, params.craftTicksComponent + 1);

    const after = getComponent(w, assembler.id) as AssemblerComponent;
    expect(after.opmem[ASM_OFF_RESULT]).toBe(RESULT_SUCCESS);
    const newId = after.opmem[ASM_OFF_LAST_PRODUCT];
    const created = getComponent(w, newId);
    expect(created?.componentType).toBe('Storage');
    // 対面辺ルール: Assembler辺2 ⇔ 新規側辺5
    expect(after.edges[2]).toBe(newId);
    expect(created?.edges[5]).toBe(assembler.id);
    // 同グループに入っている
    expect(created?.groupId).toBe(after.groupId);
  });

  it('REPAIRのコストは修理回数ごとに逓増する', () => {
    let w = buildWorld(minimalAncestorConfig([], 1000));
    const assembler = findComponent(w, 'Assembler');
    const harvester = findComponent(w, 'Harvester');
    const storage = findComponent(w, 'Storage') as StorageComponent;

    // 修理対象: Harvester（材料 ConductiveGel）を損耗させる
    w = replaceObject(w, { ...getComponent(w, harvester.id)!, durability: 100 });
    const items = new Map((getComponent(w, storage.id) as StorageComponent).items);
    items.set(substanceCodeOf('ConductiveGel'), 2);
    w = replaceObject(w, { ...(getComponent(w, storage.id) as StorageComponent), items });

    const energyBefore1 = (getComponent(w, storage.id) as StorageComponent).energy;
    w = poke(w, assembler.id, [
      [ASM_OFF_REPAIR_TARGET, harvester.id],
      [ASM_OFF_ACTION_TRIGGER, ASM_TRIGGER_REPAIR],
    ]);
    w = tick(w);
    const energyAfter1 = (getComponent(w, storage.id) as StorageComponent).energy;
    const repaired1 = getComponent(w, harvester.id)!;
    // +400（修理）-1（tick0の経年劣化: 0 % AGE_INTERVAL === 0）
    expect(repaired1.durability).toBe(100 + params.repairAmount - 1);
    expect(repaired1.repairCount).toBe(1);
    // 1回目 = 基本料 ×1（＋当tickのProcessorは停止しているので消費はREPAIRのみ）
    expect(energyBefore1 - energyAfter1).toBe(params.repairBaseEnergy);

    // 2回目 = 基本料 ×2
    const energyBefore2 = energyAfter1;
    w = poke(w, assembler.id, [
      [ASM_OFF_REPAIR_TARGET, harvester.id],
      [ASM_OFF_ACTION_TRIGGER, ASM_TRIGGER_REPAIR],
    ]);
    w = tick(w);
    const energyAfter2 = (getComponent(w, storage.id) as StorageComponent).energy;
    expect(energyBefore2 - energyAfter2).toBe(params.repairBaseEnergy * 2);
    expect(getComponent(w, harvester.id)!.repairCount).toBe(2);
  });
});

describe('Harvester', () => {
  it('フィルタ指定で最近傍の対象物質を回収しStorageへ格納する', () => {
    let w = buildWorld(minimalAncestorConfig([], 1000));
    const harvester = findComponent(w, 'Harvester');
    const storage = findComponent(w, 'Storage');

    w = poke(w, harvester.id, [
      [HARV_OFF_FILTER, TYPE_CODE_SUBSTANCE_BASE + substanceCodeOf('InfoSeed')],
      [HARV_OFF_TRIGGER, 1],
    ]);
    w = tick(w);

    const storageAfter = getComponent(w, storage.id) as StorageComponent;
    expect(storageAfter.items.get(substanceCodeOf('InfoSeed'))).toBe(1);
    // クレードルのInfoSeedノードが1減っている
    const node = w.objects.find(
      o => o.kind === 'matterNode' && o.substanceCode === substanceCodeOf('InfoSeed'),
    );
    expect(node !== undefined && node.kind === 'matterNode' && node.remaining).toBe(
      params.nodeAmountByAbundance.rare - 1,
    );
  });

  it('エネルギーをEnergyNodeから回収する（流量制限つき）', () => {
    let w = buildWorld(minimalAncestorConfig([], 100));
    const harvester = findComponent(w, 'Harvester');
    const storage = findComponent(w, 'Storage');

    w = poke(w, harvester.id, [
      [HARV_OFF_FILTER, 20],
      [HARV_OFF_TRIGGER, 1],
    ]);
    w = tick(w);
    const after = getComponent(w, storage.id) as StorageComponent;
    // 回収40 - アクションコスト2
    expect(after.energy).toBe(100 + params.harvestEnergyRate - params.harvestActionCost);
  });
});

describe('AUTO辺指定', () => {
  it('EDGE_AUTOは接続先の最小空き辺を使う', () => {
    let w = buildWorld(minimalAncestorConfig([], 1000));
    const assembler = findComponent(w, 'Assembler');
    const storage = findComponent(w, 'Storage') as StorageComponent;
    const items = new Map(storage.items);
    items.set(substanceCodeOf('ReinforcedMatrix'), 1);
    items.set(substanceCodeOf('DenseMatrix'), 1);
    w = replaceObject(w, { ...storage, items });

    w = poke(w, assembler.id, [
      [ASM_OFF_RECIPE_CODE, recipeCodeOf('RC8')],
      [ASM_OFF_ACTION_TRIGGER, ASM_TRIGGER_SET_RECIPE],
    ]);
    w = tick(w, params.reconfigTicks + 1);
    w = poke(w, assembler.id, [
      [ASM_OFF_CONNECTION_TARGET, assembler.id],
      [ASM_OFF_CONNECTION_EDGE, EDGE_AUTO],
      [ASM_OFF_ACTION_TRIGGER, ASM_TRIGGER_ASSEMBLE],
    ]);
    w = tick(w, params.craftTicksComponent + 1);

    const after = getComponent(w, assembler.id) as AssemblerComponent;
    // 接続構成 [0,1,0],[1,2,1] では、Assembler側は辺3（Processorの対面）と辺1（Storage）が
    // 使用済みのため、最小の空き辺は0
    expect(after.edges[0]).toBe(after.opmem[ASM_OFF_LAST_PRODUCT]);
  });
});
