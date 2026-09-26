import { describe, expect, it } from 'vitest';
import { CaptionPlayer } from '../ui/captions';
import type { CaptionEntry, CaptionScript } from '../ui/captions';
import { selectEntries } from '../src/tools/recording-script';
import { experimentById, RECORDING_PARAMS } from '../src/experiments';
import { createRng } from '../src/rng';
import { buildInitialWorld } from '../src/sim/initial-state';
import { executeTick } from '../src/sim/simulation';
import { formatAtomTotals, totalAtoms } from '../src/sim/accounting';

const entry = (tick: number, kind: CaptionEntry['kind'], text = 'x'): CaptionEntry => ({
  tick,
  kind,
  text,
  x: 0,
  y: 0,
  objectId: null,
  marker: true,
  leadSeconds: 3,
  holdSeconds: 4,
});

const script = (entries: readonly CaptionEntry[]): CaptionScript => ({
  gameVersion: '9.9.9',
  experimentId: 'recording',
  seed: 1,
  ticks: 1000,
  generatedBy: 'test',
  entries,
});

describe('録画用の実験', () => {
  it('recording 実験が登録され、資源の薄い世界を使う', () => {
    const experiment = experimentById('recording');
    expect(experiment.id).toBe('recording');
    expect(experiment.params).toBe(RECORDING_PARAMS);
    // 既定の移動種の世界より資源が薄い（枯渇を録画枠に収めるため）
    expect(RECORDING_PARAMS.nodeAmountByAbundance.rare).toBeLessThan(200);
  });

  it('台本の tick は実機の走行と一致する（決定論・同じ経路で世界を作る）', () => {
    const experiment = experimentById('recording');
    const seed = experiment.defaultSeed;
    const run = (): string => {
      const rng = createRng(seed);
      let world = buildInitialWorld(experiment.build(seed), experiment.params, rng);
      const births: number[] = [];
      for (let i = 0; i < 2500; i++) {
        const result = executeTick(world, experiment.params, rng);
        world = result.world;
        for (const e of result.events) if (e.type === 'processor_started') births.push(i);
      }
      return `${births.join(',')}|${formatAtomTotals(totalAtoms(world))}`;
    };
    expect(run()).toBe(run());
  });
});

describe('字幕の台本づくり', () => {
  it('種類ごとに間引き、近すぎる字幕は採らない', () => {
    const selected = selectEntries([
      entry(100, 'birth'),
      entry(150, 'birth'), // 直前と近すぎる
      entry(1000, 'birth'),
      entry(2000, 'birth'), // birth は2回まで
      entry(3000, 'death'),
    ]);
    expect(selected.map(e => e.tick)).toEqual([100, 1000, 3000]);
  });

  it('採用順は tick 昇順になる', () => {
    const selected = selectEntries([entry(3000, 'death'), entry(100, 'birth'), entry(1500, 'decay')]);
    expect(selected.map(e => e.tick)).toEqual([100, 1500, 3000]);
  });
});

describe('字幕プレイヤー', () => {
  it('実験・シード・版が合わない台本は使わない', () => {
    const player = new CaptionPlayer();
    player.load(script([entry(10, 'birth')]), 'recording', 999, '9.9.9');
    expect(player.loaded).toBe(false);
    expect(player.notice).not.toBeNull();

    player.load(script([entry(10, 'birth')]), 'recording', 1, '9.9.8');
    expect(player.loaded).toBe(false);

    player.load(script([entry(10, 'birth')]), 'recording', 1, '9.9.9');
    expect(player.loaded).toBe(true);
    expect(player.notice).toBeNull();
  });

  it('発生前は予告として出し、発生の瞬間に本表示へ切り替わる', () => {
    const player = new CaptionPlayer();
    player.load(script([entry(300, 'birth')]), 'recording', 1, '9.9.9');
    // 実測30tick/s・lead=3秒 → 90tick 前から予告が出る
    let now = 0;
    for (let tick = 0; tick <= 205; tick++) player.update(tick, (now += 1000 / 30));
    expect(player.current).toBeNull(); // まだ早い

    for (let tick = 206; tick <= 299; tick++) player.update(tick, (now += 1000 / 30));
    expect(player.current?.pending).toBe(true); // 予告中

    player.update(300, (now += 1000 / 30));
    expect(player.current?.pending).toBe(false); // 発生した
  });

  it('表示時間が尽きたら消える', () => {
    const player = new CaptionPlayer();
    player.load(script([entry(100, 'birth')]), 'recording', 1, '9.9.9');
    let now = 0;
    for (let tick = 0; tick <= 100; tick++) player.update(tick, (now += 1000 / 30));
    expect(player.current).not.toBeNull();
    // hold=4秒ぶん進める
    for (let tick = 101; tick <= 260; tick++) player.update(tick, (now += 1000 / 30));
    expect(player.current).toBeNull();
  });

  it('一度に一つしか出さない（次の出番が来ても前の字幕を読む時間を確保する）', () => {
    const player = new CaptionPlayer();
    // 死(100) → 崩壊(140): 実機でも起きる詰まり方
    player.load(script([entry(100, 'death', 'death'), entry(140, 'decay', 'decay')]), 'recording', 1, '9.9.9');
    let now = 0;
    for (let tick = 0; tick <= 100; tick++) player.update(tick, (now += 1000 / 30));
    expect(player.current?.entry.text).toBe('death');
    // 崩壊の予告時刻を過ぎても、死の字幕が最低表示時間を満たすまでは譲らない
    player.update(101, (now += 1000 / 30));
    expect(player.current?.entry.text).toBe('death');
    for (let tick = 102; tick <= 200; tick++) player.update(tick, (now += 1000 / 30));
    expect(player.current?.entry.text).toBe('decay');
  });
});
