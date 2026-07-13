/**
 * 自己修復種（自己修復 = self-repair）。
 *
 * プロジェクト目標が掲げる「自己複製/自己拡張/自己修復」のうち、自己修復を実証する。
 * この個体は子を作らず自分も拡張しない。代わりに、劣化していく自分の器官
 * （Processor・Assembler・Harvester）をREPAIRで修理し続け、寿命を延ばす。
 *
 * サイクル: 修理材料の回収と生産（R4→R5→R9→R7）→ 3器官をREPAIR。
 * REPAIRのエネルギーコストは修理回数ごとに逓増する（R4: 再生産コスト<修理コスト）ため、
 * 生涯総修理コストは修理回数の2乗で増える。単独では有限の延命にとどまり、大局的には
 * 再生産（実験01）が有利になる——この非対称性を実データで示すための対照種である。
 *
 * repair=false で起動すると、同じ行動負荷（回収・クラフト）のまま修理をしない。
 * これにより「修理あり/なし」でProcessor寿命を比較できる。
 */

import { recipeCodeOf, substanceCodeOf, TYPE_CODE_SUBSTANCE_BASE } from '../sim/codes';
import { ASM_OFF_REPAIR_TARGET } from '../sim/opmem';
import { ProgramBuilder } from '../vm/program-builder';
import { makeHelpers } from './helpers';

// このプログラムは自己複製しないためコードが大きい。表とグローバルはコード領域の上に置く
const MATERIALS_BASE = 940;
const CRAFT_BASE = 960;
const REPAIRER_GLOBALS = 1010;
const G_SELF = 0; // 自分（Processor）のオブジェクトID
const G_ASM = 1;
const G_HARV = 2;
const G_PARITY = 3; // 生産サイクルのパリティ（過剰生産を防ぐ）
// 維持エネルギーはStorage容量(2000)の近くに置く。逓増する修理コスト（基本料×修理回数）が
// この水準を超えると、修理はエネルギー不足で拒否される（＝支払えない）。以降は修理できず
// 器官が劣化して死ぬ。これがR4（再生産コスト<修理コスト）の壁である。
const ENERGY_LOW = 1950;

/**
 * 1生産サイクル分の材料。生産は1サイクルおき（parity）なので、2主サイクル分の修理材料
 * （各器官2個ずつ）をちょうど作る。R5を2回呼ぶことでReactiveFragmentの過剰生産を防ぎ、
 * 全材料の収支を均衡させる（Storageが埋まらない → 限界は純粋にエネルギー壁になる）。
 */
const MATERIALS: ReadonlyArray<readonly [string, number]> = [
  ['BaseSolid', 2],
  ['VolatileCore', 1],
  ['BindingShard', 2],
  ['InfoSeed', 2],
  ['SignalFluid', 1],
];

export const buildRepairerProgram = (repair = true): number[] => {
  const b = new ProgramBuilder();
  let tagCounter = 0;
  const tag = (name: string): string => `${name}_${tagCounter++}`;
  const h = makeHelpers(b, tag);

  /** Assemblerに対象を指定してREPAIRを発行し、完了を待つ。rawSelf=trueは自分を対象 */
  const repairOne = (rawSelf: boolean, targetSlot: number): void => {
    const wait = tag('rWait');
    h.setTargetFromGlobal(G_ASM);
    if (rawSelf) {
      b.li(1, 0x0006).in(3, 1); // SELF_OBJECT_ID
      h.extWriteReg(ASM_OFF_REPAIR_TARGET, 3); // 生IDを直接書く（Assemblerは生IDで解決）
    } else {
      b.lw(3, 7, targetSlot);
      h.extWriteLocalId(ASM_OFF_REPAIR_TARGET, 3); // lid→生ID変換で書く
    }
    h.extWriteImm(7, 0); // result=0
    h.extWriteImm(0, 4); // REPAIR
    b.mark(wait);
    b.halt();
    h.extRead(7, 6);
    b.beqlTo(6, 0, wait);
  };

  b.li(7, REPAIRER_GLOBALS);
  b.li(1, 0x0006).in(3, 1);
  b.sw(3, 7, G_SELF);
  h.cscanFind(1, G_ASM);
  h.cscanFind(6, G_HARV);
  b.li(3, 1).sw(3, 7, G_PARITY); // 初回サイクルで生産するため1で開始

  b.mark('cycle');
  // 材料回収と修理材料の生産（レシピ収量は2、消費は1/器官なので1サイクルおきに生産して収支を均衡）
  b.lw(3, 7, G_PARITY);
  b.li(2, 1).sub(3, 2, 3).sw(3, 7, G_PARITY); // parity ^= 1
  b.li(2, 0);
  b.bnelTo(3, 2, 'skipCraft');
  h.gatherFromTable(G_HARV, MATERIALS_BASE, ENERGY_LOW);
  // R4→R5→R5→R9→R7（工程表 CRAFT_BASE）。修理材料を各器官2個ずつ均衡生産する
  h.craftListLoop(G_ASM, G_HARV, CRAFT_BASE, ENERGY_LOW);
  b.mark('skipCraft');

  if (repair) {
    h.ensureEnergy(G_HARV, ENERGY_LOW);
    repairOne(true, G_SELF); // Processor（自分）
    h.ensureEnergy(G_HARV, ENERGY_LOW);
    repairOne(false, G_ASM); // Assembler
    h.ensureEnergy(G_HARV, ENERGY_LOW);
    repairOne(false, G_HARV); // Harvester
  }

  b.jmpTo('cycle');

  const code = b.build();
  if (code.length > MATERIALS_BASE) {
    throw new Error(`自己修復種のコードが大きすぎる: ${code.length} > ${MATERIALS_BASE}`);
  }
  const memory = new Array<number>(1024).fill(0);
  for (let i = 0; i < code.length; i++) memory[i] = code[i];
  let addr = MATERIALS_BASE;
  for (const [substanceId, count] of MATERIALS) {
    memory[addr++] = TYPE_CODE_SUBSTANCE_BASE + substanceCodeOf(substanceId);
    memory[addr++] = count;
  }
  memory[addr] = 0;
  // クラフト工程表: R4→R5→R5→R9→R7（各1回、非組立）
  addr = CRAFT_BASE;
  for (const recipeId of ['R4', 'R5', 'R5', 'R9', 'R7']) {
    memory[addr++] = recipeCodeOf(recipeId);
  }
  memory[addr] = 0;
  return memory;
};

export const buildRepairerConfig = (seed: number, repair = true) => ({
  seed,
  autoNodes: false,
  ancestors: [
    {
      x: 50,
      y: 50,
      cradle: true,
      components: [
        { type: 'Processor' as const, program: buildRepairerProgram(repair), running: true },
        { type: 'Assembler' as const },
        { type: 'Storage' as const, energy: 1500 },
        { type: 'Harvester' as const },
      ],
      connections: [
        [0, 1, 0] as [number, number, number],
        [1, 2, 1] as [number, number, number],
        [2, 3, 2] as [number, number, number],
      ],
    },
  ],
});
