/**
 * 自己拡張種（自己拡張 = self-expansion）。
 *
 * プロジェクト目標が掲げる「自己複製/自己拡張/自己修復」のうち、自己拡張を実証する。
 * この個体は子個体を作らず、自分自身の身体にコンポーネント（Storage）を追加して成長する。
 * 追加した部品は自グループに接続され、個体は一つのまま大きくなる。
 *
 * サイクル: 材料回収 → Storage生産（R1×3 → R21 → RC8）→ 直前に追加した部品へ接続 →
 * 成長カウンタを進める → 目標サイズに達したら維持（アイドル）。
 *
 * 構成（初期4部品、祖先種と同じ）: Processor + Assembler + Storage + Harvester。
 * 「自分に何を足すか」はこのプログラムの判断であり、システムは接続という物理法則のみ提供する。
 */

import { recipeCodeOf, substanceCodeOf, TYPE_CODE_SUBSTANCE_BASE } from '../sim/codes';
import { ProgramBuilder } from '../vm/program-builder';
import { GLOBALS_BASE, makeHelpers } from './helpers';

const MATERIALS_BASE = 880;
const G_ASM = 0;
const G_HARV = 1;
const G_LAST = 2; // 直前に追加した部品のlid（初期=Assembler）
const G_GROWN = 3; // これまでに追加した部品数
const ENERGY_LOW = 900;

/** 1回の拡張に必要な材料（Storage 1個分: R1×3 + R21 + RC8） */
const MATERIALS: ReadonlyArray<readonly [string, number]> = [
  ['BaseSolid', 3],
  ['BindingShard', 8],
];

export const buildExpanderProgram = (targetGrowth = 4): number[] => {
  const b = new ProgramBuilder();
  let tagCounter = 0;
  const tag = (name: string): string => `${name}_${tagCounter++}`;
  const h = makeHelpers(b, tag);

  b.li(7, GLOBALS_BASE);
  h.cscanFind(1, G_ASM);
  h.cscanFind(6, G_HARV);
  // 最初の接続先はAssembler
  b.lw(3, 7, G_ASM).sw(3, 7, G_LAST);
  b.li(3, 0).sw(3, 7, G_GROWN);

  b.mark('grow');
  // 目標サイズに達したら維持ループへ
  b.lw(3, 7, G_GROWN);
  b.li(2, targetGrowth);
  b.bgelTo(3, 2, 'maintain');

  // 材料回収
  h.gatherFromTable(G_HARV, MATERIALS_BASE, ENERGY_LOW);

  // Storage生産チェーン
  h.ensureEnergy(G_HARV, ENERGY_LOW);
  h.craftOne(G_ASM, recipeCodeOf('R1'), false, -1, -1);
  h.ensureEnergy(G_HARV, ENERGY_LOW);
  h.craftOne(G_ASM, recipeCodeOf('R1'), false, -1, -1);
  h.ensureEnergy(G_HARV, ENERGY_LOW);
  h.craftOne(G_ASM, recipeCodeOf('R1'), false, -1, -1);
  h.ensureEnergy(G_HARV, ENERGY_LOW);
  h.craftOne(G_ASM, recipeCodeOf('R21'), false, -1, -1);
  h.ensureEnergy(G_HARV, ENERGY_LOW);
  // RC8を直前部品へ接続し、新部品のlidをG_LASTへ保存（連鎖成長）
  h.craftOne(G_ASM, recipeCodeOf('RC8'), true, G_LAST, G_LAST);

  // 成長カウンタ++
  b.lw(3, 7, G_GROWN).addi(3, 3, 1).sw(3, 7, G_GROWN);
  b.jmpTo('grow');

  b.mark('maintain');
  b.halt();
  b.jmpTo('maintain');

  const code = b.build();
  if (code.length > MATERIALS_BASE) {
    throw new Error(`自己拡張種のコードが大きすぎる: ${code.length} > ${MATERIALS_BASE}`);
  }
  const memory = new Array<number>(1024).fill(0);
  for (let i = 0; i < code.length; i++) memory[i] = code[i];
  let addr = MATERIALS_BASE;
  for (const [substanceId, count] of MATERIALS) {
    memory[addr++] = TYPE_CODE_SUBSTANCE_BASE + substanceCodeOf(substanceId);
    memory[addr++] = count;
  }
  memory[addr] = 0;
  return memory;
};

export const buildExpanderConfig = (seed: number, targetGrowth = 4) => ({
  seed,
  autoNodes: false,
  ancestors: [
    {
      x: 50,
      y: 50,
      cradle: true,
      components: [
        { type: 'Processor' as const, program: buildExpanderProgram(targetGrowth), running: true },
        { type: 'Assembler' as const },
        { type: 'Storage' as const, energy: 1000 },
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
