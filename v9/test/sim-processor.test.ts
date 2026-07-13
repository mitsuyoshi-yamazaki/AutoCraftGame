import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { substanceCodeOf } from '../src/sim/codes';
import {
  HARV_OFF_TRIGGER,
  PROC_OFF_CSCAN_COUNT,
  PROC_OFF_CSCAN_RESULTS,
  PROC_OFF_CSCAN_TRIGGER,
  PROC_OFF_RUN_FLAG,
} from '../src/sim/opmem';
import { executeTick } from '../src/sim/simulation';
import type { ProcessorComponent, StorageComponent, World } from '../src/sim/types';
import { getComponent, replaceObject } from '../src/sim/world';
import { ProgramBuilder } from '../src/vm/program-builder';
import { buildWorld, findComponent, makeParams, minimalAncestorConfig } from './sim-helpers';

const params = makeParams();
const rng = createRng(1);

const tick = (world: World, times = 1): World => {
  let w = world;
  for (let i = 0; i < times; i++) {
    w = executeTick(w, params, rng).world;
  }
  return w;
};

describe('Processor I/O', () => {
  it('自身状態の読取（GROUP_ENERGY, SELF_DURABILITY）をpmemへ保存できる', () => {
    // GROUP_ENERGY(0x0004)をr1へ読み、mem[100]へ保存
    const program = new ProgramBuilder()
      .li(1, 0x0004)
      .in(2, 1)
      .li(3, 100)
      .sw(2, 3, 0)
      .li(1, 0x0005)
      .in(2, 1)
      .li(3, 101)
      .sw(2, 3, 0)
      .halt()
      .build();
    let w = buildWorld(minimalAncestorConfig(program, 800));
    const processor = findComponent(w, 'Processor');
    w = tick(w);
    const after = getComponent(w, processor.id) as ProcessorComponent;
    // GROUP_ENERGY: 実行コスト1を支払った後の値
    expect(after.memory[100]).toBe(800 - params.procTickCost);
    expect(after.memory[101]).toBe(params.maxDurability);
  });

  it('CSCANでグループメンバーのローカルIDが得られ、外部opmem書込でアクションを起動できる', () => {
    // tick0: CSCAN(filter=Harvester=6) → tick1: 結果のlidを使いHarvesterのトリガを書く
    const builder = new ProgramBuilder();
    builder
      .li(1, 0x0100 + PROC_OFF_CSCAN_TRIGGER + 1) // cscan_filter (trigger+1)
      .li(2, 6)
      .out(1, 2)
      .li(1, 0x0100 + PROC_OFF_CSCAN_TRIGGER)
      .li(2, 1)
      .out(1, 2)
      .halt()
      // tick1: lid = opmem[cscan_results] → 外部opmem: TARGET=lid, OFFSET=0(trigger), VALUE=1
      .li(1, 0x0100 + PROC_OFF_CSCAN_RESULTS)
      .in(3, 1)
      .li(1, 0x1000)
      .out(1, 3)
      .li(1, 0x1001)
      .li(2, 0)
      .out(1, 2)
      .li(1, 0x1002)
      .li(2, 1)
      .out(1, 2)
      .halt();
    const program = builder.build();

    let w = buildWorld(minimalAncestorConfig(program, 800));
    const processor = findComponent(w, 'Processor');
    const harvester = findComponent(w, 'Harvester');
    const storage = findComponent(w, 'Storage');

    w = tick(w); // CSCANトリガ→アクションフェーズで実行
    const proc1 = getComponent(w, processor.id) as ProcessorComponent;
    expect(proc1.opmem[PROC_OFF_CSCAN_COUNT]).toBe(1);

    w = tick(w); // lid読取→Harvesterへトリガ書込→同tickのアクションフェーズでHARVEST実行
    const harvesterAfter = getComponent(w, harvester.id)!;
    expect(harvesterAfter.opmem[HARV_OFF_TRIGGER]).toBe(0); // 処理済み
    const storageAfter = getComponent(w, storage.id) as StorageComponent;
    // クレードルの何かを回収した（物質1個 or エネルギー）
    const gotMatter = [...storageAfter.items.values()].reduce((a, b) => a + b, 0) > 0;
    const gotEnergy = storageAfter.energy > 800;
    expect(gotMatter || gotEnergy).toBe(true);
  });

  it('外部pmem書込（AUTO）で別Processorへプログラムを複写し、run_flagで起動できる', () => {
    // 子: 停止状態のProcessor（グループ外・近接に配置）
    // 親プログラム: 自分のmem[200..204]の5語を子のaddr0へ書き、run_flag=1を書く
    const child = new ProgramBuilder().li(1, 0x0004).in(2, 1).halt().build(); // 子に書き込む内容（ダミーではなく実行可能）
    const builder = new ProgramBuilder();
    builder
      // CSCANでは見えない（別グループ）→ SCANはSensorがないため不可。
      // テストでは既知の生IDをローカルIDに登録する経路がないため、
      // 子は同グループに置く（組立直後の子相当）。CSCAN(filter=Processor)でlidを得る。
      .li(1, 0x0100 + PROC_OFF_CSCAN_TRIGGER + 1)
      .li(2, 2) // filter=Processor
      .out(1, 2)
      .li(1, 0x0100 + PROC_OFF_CSCAN_TRIGGER)
      .li(2, 1)
      .out(1, 2)
      .halt()
      // tick1: lid取得 → pmem書込
      .li(1, 0x0100 + PROC_OFF_CSCAN_RESULTS)
      .in(3, 1) // 子Processorのlid
      .li(1, 0x2000)
      .out(1, 3)
      .li(1, 0x2001)
      .li(2, 0)
      .out(1, 2);
    // 5語コピー: mem[200+i] → 0x2003
    builder.li(4, 200).li(5, 205).mark('copy');
    builder.lw(2, 4, 0).li(1, 0x2003).out(1, 2).addi(4, 4, 1).bltlTo(4, 5, 'copy');
    // 起動: 外部opmem TARGET=lid, OFFSET=run_flag(0), VALUE=1
    builder
      .li(1, 0x1000)
      .out(1, 3)
      .li(1, 0x1001)
      .li(2, PROC_OFF_RUN_FLAG)
      .out(1, 2)
      .li(1, 0x1002)
      .li(2, 1)
      .out(1, 2)
      .mark('idle')
      .halt()
      .jmpTo('idle');
    const parentProgram = builder.build();

    let w = buildWorld({
      seed: 7,
      autoNodes: false,
      ancestors: [
        {
          x: 50,
          y: 50,
          components: [
            { type: 'Processor', program: parentProgram, running: true },
            { type: 'Storage', energy: 500 },
            { type: 'Processor', running: false }, // 子（同グループ・非活性）
          ],
          connections: [
            [0, 1, 0],
            [1, 2, 1],
          ],
        },
      ],
    });
    const processors = w.objects.filter(
      o => o.kind === 'component' && o.componentType === 'Processor',
    );
    const parent = processors[0] as ProcessorComponent;
    const childProc = processors[1] as ProcessorComponent;

    // 親のmem[200..204]に子プログラムを埋めておく
    const parentWithData = getComponent(w, parent.id) as ProcessorComponent;
    const memory = [...parentWithData.memory];
    for (let i = 0; i < child.length; i++) memory[200 + i] = child[i];
    w = replaceObject(w, { ...parentWithData, memory });

    w = tick(w, 3);

    const childAfter = getComponent(w, childProc.id) as ProcessorComponent;
    expect(childAfter.memory.slice(0, child.length)).toEqual(child);
    expect(childAfter.running).toBe(true);
  });

  it('エネルギー不足のProcessorは実行されない（飢餓）', () => {
    const program = new ProgramBuilder().li(1, 42).halt().build();
    let w = buildWorld(minimalAncestorConfig(program, 0)); // エネルギー0
    const processor = findComponent(w, 'Processor');
    w = tick(w);
    const after = getComponent(w, processor.id) as ProcessorComponent;
    expect(after.registers[1]).toBe(0); // 実行されていない
    expect(after.pc).toBe(0);
  });
});

describe('原子コードの整合', () => {
  it('substanceCodeOfはデータ定義順の連番', () => {
    expect(substanceCodeOf('BaseSolid')).toBe(1);
  });
});
