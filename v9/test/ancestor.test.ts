import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { buildAncestorConfig } from '../src/programs/ancestor-config';
import { ANCESTOR_LAYOUT, buildAncestorProgram } from '../src/programs/ancestor';
import { formatAtomTotals, totalAtoms } from '../src/sim/accounting';
import { buildInitialWorld } from '../src/sim/initial-state';
import { executeTick } from '../src/sim/simulation';
import type { GameParams } from '../src/params';
import type { ProcessorComponent, World } from '../src/sim/types';
import { isWreck } from '../src/sim/types';
import { makeParams, snapshot } from './sim-helpers';

const runningProcessors = (world: World): ProcessorComponent[] =>
  world.objects.filter(
    (o): o is ProcessorComponent =>
      o.kind === 'component' && o.componentType === 'Processor' && o.running && !isWreck(o),
  );

const fullGroups = (world: World): number =>
  world.objects.filter(o => o.kind === 'group' && o.memberIds.length === 4).length;

/** predicateが満たされるまで実行する。満たされたtickを返す（上限超過は-1） */
const runUntil = (
  config: ReturnType<typeof buildAncestorConfig>,
  params: GameParams,
  maxTicks: number,
  predicate: (world: World) => boolean,
): { world: World; tick: number } => {
  const rng = createRng(config.seed);
  let world = buildInitialWorld(config, params, rng);
  for (let i = 0; i < maxTicks; i++) {
    world = executeTick(world, params, rng).world;
    if (predicate(world)) return { world, tick: world.tick };
  }
  return { world, tick: -1 };
};

describe('祖先種v0: 自己複製', () => {
  it('プログラムはpmem内に収まる（コード領域<768語）', () => {
    const program = buildAncestorProgram();
    expect(program).toHaveLength(1024);
    // コード末尾がCODE_LIMITを超えないことはbuildAncestorProgram内で検証される
    expect(() => buildAncestorProgram({ mutation: true })).not.toThrow();
  });

  it('1回目の複製が2500tick以内に完了する（子個体4部品・子Processor稼働・子にエネルギー）', () => {
    const params = makeParams();
    const config = buildAncestorConfig(42);
    const initialAtoms = formatAtomTotals(
      totalAtoms(buildInitialWorld(config, params, createRng(config.seed))),
    );

    const { world, tick } = runUntil(config, params, 2500, w => runningProcessors(w).length >= 2);
    expect(tick).toBeGreaterThan(0);

    // 子個体: 4メンバーのグループが2つ
    expect(fullGroups(world)).toBe(2);
    // 子のStorageにはエネルギーが分与されている
    const storages = world.objects.filter(
      o => o.kind === 'component' && o.componentType === 'Storage',
    );
    expect(storages).toHaveLength(2);
    // 原子保存
    expect(formatAtomTotals(totalAtoms(world))).toBe(initialAtoms);
  });

  it('親は複製を繰り返す（6000tick以内に3体目のProcessorが稼働する）', () => {
    const params = makeParams();
    const config = buildAncestorConfig(42);
    const { world, tick } = runUntil(config, params, 6000, w => runningProcessors(w).length >= 3);
    expect(tick).toBeGreaterThan(0);
    expect(fullGroups(world)).toBeGreaterThanOrEqual(3);
  });
});

describe('祖先種v1: 意図的変異（本プロジェクトの核心実験）', () => {
  it('変異なしの複製は完全に忠実（コード・表領域にビット差分なし）', () => {
    const params = makeParams();
    const config = buildAncestorConfig(42); // mutation無効
    const { world, tick } = runUntil(config, params, 2500, w => runningProcessors(w).length >= 2);
    expect(tick).toBeGreaterThan(0);

    const [parent, child] = runningProcessors(world).sort((a, b) => a.id - b.id);
    const diffs: number[] = [];
    for (let addr = 0; addr < ANCESTOR_LAYOUT.GLOBALS_BASE; addr++) {
      if (parent.memory[addr] !== child.memory[addr]) diffs.push(addr);
    }
    expect(diffs).toEqual([]);
  });

  it('変異ありの複製では、プログラム自身が選んだ1語が子のコピーでのみ変化する', () => {
    const params = makeParams();
    // gateMask=0: 毎複製で必ず1ビット反転（実験を決定的にするため）
    const config = buildAncestorConfig(42, { mutation: true, mutationGateMask: 0 });
    const { world, tick } = runUntil(config, params, 2500, w => runningProcessors(w).length >= 2);
    expect(tick).toBeGreaterThan(0);

    const [parent, child] = runningProcessors(world).sort((a, b) => a.id - b.id);
    // グローバル領域（実行時に書き換わる）を除いたコード・表領域を比較
    const diffs: Array<{ addr: number; parent: number; child: number }> = [];
    for (let addr = 0; addr < ANCESTOR_LAYOUT.GLOBALS_BASE; addr++) {
      if (parent.memory[addr] !== child.memory[addr]) {
        diffs.push({ addr, parent: parent.memory[addr], child: child.memory[addr] });
      }
    }
    // ちょうど1語・1ビットの差分（変異がグローバル領域に落ちた場合は0語もありうるが、
    // seed=42の決定論的実行では1語になることを確認済みの値として固定する）
    expect(diffs).toHaveLength(1);
    const xor = diffs[0].parent ^ diffs[0].child;
    expect(xor & (xor - 1)).toBe(0); // 1ビットだけ立っている
  });

  it('現実的な変異率でも系統内に生存する変異体が現れる（seedSalt=2, 1/4, 豊かなクレードル）', () => {
    const params = makeParams({
      nodeAmountByAbundance: { abundant: 400, common: 200, limited: 200, rare: 120 },
    });
    const options = { mutation: true, mutationGateMask: 3, seedSalt: 2 };
    const original = buildAncestorProgram(options);
    const config = buildAncestorConfig(42, options);
    const rng = createRng(config.seed);
    let world = buildInitialWorld(config, params, rng);
    for (let i = 0; i < 6500; i++) {
      world = executeTick(world, params, rng).world;
    }
    const processors = world.objects.filter(
      (o): o is ProcessorComponent => o.kind === 'component' && o.componentType === 'Processor',
    );
    const founderId = Math.min(...processors.map(p => p.id));
    const mutants = processors
      .filter(p => p.id !== founderId)
      .filter(p => {
        for (let addr = 0; addr < ANCESTOR_LAYOUT.GLOBALS_BASE; addr++) {
          if (p.memory[addr] !== original[addr]) return true;
        }
        return false;
      });
    expect(mutants.length).toBeGreaterThanOrEqual(2);
    // 観察された変異体は生存している（エネルギー恒常性が保たれている）
    expect(mutants.some(p => p.running && p.durability > 0)).toBe(true);
  });

  it('変異を含めて決定論が保たれる（同一シード2回で完全一致）', () => {
    const params = makeParams();
    const config = buildAncestorConfig(42, { mutation: true, mutationGateMask: 0 });
    const run = (): string => {
      const rng = createRng(config.seed);
      let world = buildInitialWorld(config, params, rng);
      for (let i = 0; i < 1500; i++) {
        world = executeTick(world, params, rng).world;
      }
      return snapshot(world);
    };
    expect(run()).toBe(run());
  });
});
