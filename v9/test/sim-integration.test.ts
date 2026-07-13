import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { formatAtomTotals, totalAtoms } from '../src/sim/accounting';
import { recipeCodeOf, substanceCodeOf, TYPE_CODE_SUBSTANCE_BASE } from '../src/sim/codes';
import { buildInitialWorld } from '../src/sim/initial-state';
import type { InitialConfig } from '../src/sim/initial-state';
import { PROC_OFF_CSCAN_RESULTS, PROC_OFF_CSCAN_TRIGGER } from '../src/sim/opmem';
import { executeTick } from '../src/sim/simulation';
import type { StorageComponent } from '../src/sim/types';
import { getComponent } from '../src/sim/world';
import { ProgramBuilder } from '../src/vm/program-builder';
import { findComponent, makeParams, minimalAncestorConfig, snapshot } from './sim-helpers';

/**
 * 「CSCANでグループ構成を知り、資源を選択的に回収し、レシピR1をクラフトする」
 * 実プログラム。祖先種プログラムの最小の縮図（探知→回収→クラフトのフルパス）。
 */
const buildGathererCrafterProgram = (params = makeParams()): number[] => {
  const builder = new ProgramBuilder();
  const setExternalTarget = (lidReg: number): void => {
    builder.li(1, 0x1000);
    builder.out(1, lidReg);
  };
  const writeExternal = (offset: number, value: number): void => {
    builder.li(1, 0x1001).li(2, offset).out(1, 2);
    builder.li(1, 0x1002).li(2, value).out(1, 2);
  };

  // tick0: CSCAN（filter=0: 全メンバー）
  builder.li(1, 0x0100 + PROC_OFF_CSCAN_TRIGGER).li(2, 1).out(1, 2).halt();

  // tick1: lid取得（構成固定: entry0=Assembler, entry2=Harvester）+ BaseSolid回収
  builder.li(1, 0x0100 + PROC_OFF_CSCAN_RESULTS).in(4, 1); // r4 = assembler lid
  builder.li(1, 0x0100 + PROC_OFF_CSCAN_RESULTS + 8).in(3, 1); // r3 = harvester lid
  setExternalTarget(3);
  writeExternal(1, TYPE_CODE_SUBSTANCE_BASE + substanceCodeOf('BaseSolid')); // filter
  writeExternal(0, 1); // trigger
  builder.halt();

  // tick2: BindingShard回収（1個目）
  writeExternal(1, TYPE_CODE_SUBSTANCE_BASE + substanceCodeOf('BindingShard'));
  writeExternal(0, 1);
  builder.halt();

  // tick3: BindingShard回収（2個目）
  writeExternal(0, 1);
  builder.halt();

  // tick4: AssemblerへSET_RECIPE(R1)
  setExternalTarget(4);
  writeExternal(1, recipeCodeOf('R1'));
  writeExternal(0, 1); // SET_RECIPE
  for (let i = 0; i < params.reconfigTicks + 1; i++) builder.halt();

  // tick10: CRAFT
  writeExternal(0, 2); // CRAFT
  for (let i = 0; i < params.craftTicksBase + 1; i++) builder.halt();

  // 以降はアイドル
  builder.mark('idle').halt().jmpTo('idle');
  return builder.build();
};

const runWorld = (config: InitialConfig, ticks: number, params = makeParams()) => {
  const rng = createRng(config.seed);
  let world = buildInitialWorld(config, params, rng);
  for (let i = 0; i < ticks; i++) {
    world = executeTick(world, params, rng).world;
  }
  return world;
};

describe('統合: 実プログラムによる回収→クラフト', () => {
  it('20tickでR1が完了し、StorageにDenseMatrixとFlexibleChainが入る', () => {
    const params = makeParams();
    const config = minimalAncestorConfig(buildGathererCrafterProgram(params), 600);
    const world = runWorld(config, 20, params);

    const storage = findComponent(world, 'Storage') as StorageComponent;
    expect(storage.items.get(substanceCodeOf('DenseMatrix'))).toBe(1);
    expect(storage.items.get(substanceCodeOf('FlexibleChain'))).toBe(1);
    // 消費された材料は残っていない
    expect(storage.items.get(substanceCodeOf('BaseSolid'))).toBeUndefined();
    expect(storage.items.get(substanceCodeOf('BindingShard'))).toBeUndefined();
  });
});

describe('統合: 決定論（R8）', () => {
  it('同一シード・同一configの2回の実行結果が完全一致する', () => {
    const params = makeParams();
    const config: InitialConfig = {
      ...minimalAncestorConfig(buildGathererCrafterProgram(params), 600),
      autoNodes: true,
      seed: 12345,
    };
    const first = snapshot(runWorld(config, 100, params));
    const second = snapshot(runWorld(config, 100, params));
    expect(second).toBe(first);
  });

  it('異なるシードでは（ノード配置が変わり）結果が異なる', () => {
    const params = makeParams();
    const base = minimalAncestorConfig(buildGathererCrafterProgram(params), 600);
    const first = snapshot(runWorld({ ...base, autoNodes: true, seed: 1 }, 30, params));
    const second = snapshot(runWorld({ ...base, autoNodes: true, seed: 2 }, 30, params));
    expect(second).not.toBe(first);
  });
});

describe('統合: 原子保存則', () => {
  it('回収・クラフト・散布を含む200tickの活動後も原子総量が不変', () => {
    const params = makeParams();
    const config = minimalAncestorConfig(buildGathererCrafterProgram(params), 600);
    const rng = createRng(config.seed);
    let world = buildInitialWorld(config, params, rng);
    const before = formatAtomTotals(totalAtoms(world));
    for (let i = 0; i < 200; i++) {
      world = executeTick(world, params, rng).world;
    }
    expect(formatAtomTotals(totalAtoms(world))).toBe(before);
  });

  it('高速劣化・崩壊（残骸化と自発変化）を含めても原子総量が不変', () => {
    const params = makeParams({ maxDurability: 20, ageInterval: 1, decayProbability: 0.1 });
    const config = minimalAncestorConfig(buildGathererCrafterProgram(params), 600);
    const rng = createRng(config.seed);
    let world = buildInitialWorld(config, params, rng);
    const before = formatAtomTotals(totalAtoms(world));
    for (let i = 0; i < 150; i++) {
      world = executeTick(world, params, rng).world;
    }
    // 全コンポーネントが崩壊し、原子は地面へ戻っている
    expect(formatAtomTotals(totalAtoms(world))).toBe(before);
    expect(world.objects.filter(o => o.kind === 'component')).toHaveLength(0);
  });

  it('組立（ASSEMBLE）を挟んでも原子総量が不変', () => {
    // sim-actions.test.ts のASSEMBLE系と同じ流れを原子会計で確認する
    const params = makeParams();
    const config: InitialConfig = {
      seed: 42,
      autoNodes: false,
      ancestors: [
        {
          x: 50,
          y: 50,
          components: [
            { type: 'Assembler' },
            {
              type: 'Storage',
              energy: 1000,
              items: { ReinforcedMatrix: 1, DenseMatrix: 1 },
            },
          ],
          connections: [[0, 1, 0]],
        },
      ],
    };
    const rng = createRng(config.seed);
    let world = buildInitialWorld(config, params, rng);
    const before = formatAtomTotals(totalAtoms(world));

    const assembler = findComponent(world, 'Assembler');
    // opmem直書きでSET_RECIPE(RC8)→ASSEMBLE
    const poke = (w: typeof world, patch: Array<readonly [number, number]>) => {
      const c = getComponent(w, assembler.id)!;
      const opmem = [...c.opmem];
      for (const [off, val] of patch) opmem[off] = val;
      return { ...w, objects: w.objects.map(o => (o.id === c.id ? { ...c, opmem } : o)) };
    };
    world = poke(world, [
      [1, recipeCodeOf('RC8')],
      [0, 1],
    ]);
    for (let i = 0; i < params.reconfigTicks + 1; i++) world = executeTick(world, params, rng).world;
    world = poke(world, [
      [2, 0],
      [0, 3],
    ]);
    for (let i = 0; i < params.craftTicksComponent + 1; i++) world = executeTick(world, params, rng).world;

    const storages = world.objects.filter(
      o => o.kind === 'component' && o.componentType === 'Storage',
    );
    expect(storages).toHaveLength(2); // 新しいStorageが生まれた
    expect(formatAtomTotals(totalAtoms(world))).toBe(before);
  });
});
