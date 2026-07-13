import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { substanceCodeOf } from '../src/sim/codes';
import { withOpmemPatch } from '../src/sim/components';
import { DIS_OFF_TARGET, DIS_OFF_TRIGGER } from '../src/sim/opmem';
import { executeTick } from '../src/sim/simulation';
import type { GameParams } from '../src/params';
import type { StorageComponent, World } from '../src/sim/types';
import { isWreck } from '../src/sim/types';
import { getComponent, getMemberGroup, replaceObject } from '../src/sim/world';
import { buildWorld, findComponent, makeParams, minimalAncestorConfig } from './sim-helpers';

const tickWith = (world: World, params: GameParams, times = 1): World => {
  const rng = createRng(99);
  let w = world;
  for (let i = 0; i < times; i++) {
    w = executeTick(w, params, rng).world;
  }
  return w;
};

describe('耐久度と残骸', () => {
  it('経年劣化で耐久度が減り、0で残骸化して機能停止する', () => {
    const params = makeParams({ maxDurability: 3, ageInterval: 1, decayProbability: 0 });
    let w = buildWorld(minimalAncestorConfig([], 100), params);
    const harvester = findComponent(w, 'Harvester');
    // maxDurability=3 なので3tickで残骸化
    w = tickWith(w, params, 3);
    const after = getComponent(w, harvester.id)!;
    expect(after.durability).toBe(0);
    expect(isWreck(after)).toBe(true);
    // 残骸は接続を維持する（グループに残る）
    expect(getMemberGroup(w, harvester.id)).toBeDefined();
  });

  it('残骸は自発変化で崩壊し、分解レシピの出力が地面に散布される', () => {
    // decayProbability=1 → 残骸化した次のtickで必ず崩壊する
    const params = makeParams({ maxDurability: 1, ageInterval: 1, decayProbability: 1 });
    let w = buildWorld(minimalAncestorConfig([], 100), params);
    const harvester = findComponent(w, 'Harvester');
    w = tickWith(w, params, 3);
    expect(getComponent(w, harvester.id)).toBeUndefined();
    // RX7: Harvester → ConductiveGel + ReactiveFragment + BindingShard
    const groundCodes = w.objects
      .filter(o => o.kind === 'ground')
      .map(o => (o.kind === 'ground' ? o.substanceCode : 0));
    expect(groundCodes).toContain(substanceCodeOf('ConductiveGel'));
    expect(groundCodes).toContain(substanceCodeOf('ReactiveFragment'));
    expect(groundCodes).toContain(substanceCodeOf('BindingShard'));
  });
});

describe('Disassembler（捕食の基盤）', () => {
  it('他グループのコンポーネントを分解し、素材を自グループのStorageへ回収する', () => {
    const params = makeParams();
    // 捕食側: Disassembler + Storage。獲物: 近接した単独Harvester
    let w = buildWorld({
      seed: 5,
      autoNodes: false,
      ancestors: [
        {
          x: 50,
          y: 50,
          components: [
            { type: 'Disassembler' },
            { type: 'Storage', energy: 200 },
          ],
          connections: [[0, 1, 0]],
        },
        {
          x: 52,
          y: 50,
          components: [{ type: 'Harvester' }],
        },
      ],
    });
    const disassembler = findComponent(w, 'Disassembler');
    const prey = findComponent(w, 'Harvester');
    const storage = findComponent(w, 'Storage');

    // 対象は生のオブジェクトID（0x1005経由の書込に相当）
    w = replaceObject(
      w,
      withOpmemPatch(getComponent(w, disassembler.id)!, [
        [DIS_OFF_TARGET, prey.id],
        [DIS_OFF_TRIGGER, 1],
      ]),
    );
    w = tickWith(w, params, params.disassembleTicks + 1);

    expect(getComponent(w, prey.id)).toBeUndefined();
    const storageAfter = getComponent(w, storage.id) as StorageComponent;
    // RX7の出力が回収されている
    expect(storageAfter.items.get(substanceCodeOf('ConductiveGel'))).toBe(1);
    expect(storageAfter.items.get(substanceCodeOf('ReactiveFragment'))).toBe(1);
    expect(storageAfter.items.get(substanceCodeOf('BindingShard'))).toBe(1);
  });

  it('グループ中央のコンポーネントを分解するとグループが分裂する', () => {
    const params = makeParams();
    // チェーン A-B-C のBを分解 → AとCが別グループ（単独×2）になる
    let w = buildWorld({
      seed: 6,
      autoNodes: false,
      ancestors: [
        {
          x: 50,
          y: 50,
          components: [
            { type: 'Sensor' },
            { type: 'Harvester' },
            { type: 'Actuator' },
          ],
          connections: [
            [0, 1, 0],
            [1, 2, 1],
          ],
        },
        {
          x: 52.5,
          y: 50,
          components: [{ type: 'Disassembler' }, { type: 'Storage', energy: 200 }],
          connections: [[0, 1, 0]],
        },
      ],
    });
    const middle = findComponent(w, 'Harvester');
    const sensor = findComponent(w, 'Sensor');
    const actuator = findComponent(w, 'Actuator');
    const disassembler = findComponent(w, 'Disassembler');

    w = replaceObject(
      w,
      withOpmemPatch(getComponent(w, disassembler.id)!, [
        [DIS_OFF_TARGET, middle.id],
        [DIS_OFF_TRIGGER, 1],
      ]),
    );
    w = tickWith(w, params, params.disassembleTicks + 1);

    expect(getComponent(w, middle.id)).toBeUndefined();
    // 分裂後: SensorとActuatorは単独（groupId=null）
    expect(getComponent(w, sensor.id)!.groupId).toBeNull();
    expect(getComponent(w, actuator.id)!.groupId).toBeNull();
  });
});
