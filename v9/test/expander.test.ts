import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { buildExpanderConfig } from '../src/programs/expander';
import { formatAtomTotals, totalAtoms } from '../src/sim/accounting';
import { buildInitialWorld } from '../src/sim/initial-state';
import { executeTick } from '../src/sim/simulation';
import type { World } from '../src/sim/types';
import { makeParams } from './sim-helpers';

const storageCount = (world: World): number =>
  world.objects.filter(o => o.kind === 'component' && o.componentType === 'Storage').length;

describe('自己拡張種（自己拡張）', () => {
  it('個体は子を作らず、自身の身体にコンポーネントを追加して成長する', () => {
    const params = makeParams();
    const config = buildExpanderConfig(42, 4);
    const rng = createRng(config.seed);
    let world = buildInitialWorld(config, params, rng);
    const initialAtoms = formatAtomTotals(totalAtoms(world));

    expect(storageCount(world)).toBe(1); // 初期は1

    for (let i = 0; i < 2000; i++) world = executeTick(world, params, rng).world;

    // 目標成長数(4)を追加 → Storageは5個
    expect(storageCount(world)).toBe(5);

    // 個体は分裂せず一つのまま（グループは1つ、全部品が同一グループ）
    const groups = world.objects.filter(o => o.kind === 'group');
    expect(groups).toHaveLength(1);
    expect(groups[0].kind === 'group' && groups[0].memberIds.length).toBe(8);

    // Processorは1つのまま（複製していない）
    const processors = world.objects.filter(
      o => o.kind === 'component' && o.componentType === 'Processor',
    );
    expect(processors).toHaveLength(1);

    // 原子保存
    expect(formatAtomTotals(totalAtoms(world))).toBe(initialAtoms);
  });
});
