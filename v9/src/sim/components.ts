/**
 * コンポーネント生成ファクトリ。
 * 新規生成時の初期状態は docs/specs/02_components.md, 03_program_io.md に従う。
 */

import type { GameParams } from '../params';
import { OPMEM_SIZE_BY_TYPE } from './opmem';
import type { ComponentObject, ComponentType, Position } from './types';
import { emptyEdges } from './types';

export const createComponent = (
  id: number,
  componentType: ComponentType,
  position: Position,
  params: GameParams,
): ComponentObject => {
  const base = {
    id,
    kind: 'component' as const,
    position,
    velocity: { x: 0, y: 0 },
    groupId: null,
    edges: emptyEdges(),
    durability: params.maxDurability,
    repairCount: 0,
    opmem: new Array(OPMEM_SIZE_BY_TYPE[componentType]).fill(0),
  };

  switch (componentType) {
    case 'Assembler':
      return {
        ...base,
        componentType,
        configuredRecipe: 0,
        phase: 'idle',
        ticksRemaining: 0,
        pendingRecipe: 0,
      };
    case 'Processor':
      return {
        ...base,
        componentType,
        running: false,
        memory: new Array(params.pmemWords).fill(0),
        registers: new Array(8).fill(0),
        pc: 0,
        localIdTable: new Map(),
        localIdCounter: 1,
        ioRegisters: { opMemTargetId: 0, opMemOffset: 0, pmemTargetId: 0, pmemAddr: 0 },
      };
    case 'MemoryCore':
      return { ...base, componentType, memory: new Array(params.memcoreWords).fill(0) };
    case 'Storage':
      return { ...base, componentType, energy: 0, items: new Map() };
    case 'Disassembler':
      return { ...base, componentType, ticksRemaining: 0, targetObjectId: 0 };
    case 'Actuator':
    case 'Sensor':
    case 'Harvester':
      return { ...base, componentType };
  }
};

/** opmemの1ワードを更新した新しいコンポーネントを返す */
export const withOpmem = <T extends ComponentObject>(
  component: T,
  offset: number,
  value: number,
): T => {
  if (offset < 0 || offset >= component.opmem.length) return component;
  const opmem = component.opmem.map((v, i) => (i === offset ? value & 0xffff : v));
  return { ...component, opmem };
};

/** opmemの複数ワードを一括更新する */
export const withOpmemPatch = <T extends ComponentObject>(
  component: T,
  patch: ReadonlyArray<readonly [number, number]>,
): T => {
  const opmem = [...component.opmem];
  for (const [offset, value] of patch) {
    if (offset >= 0 && offset < opmem.length) opmem[offset] = value & 0xffff;
  }
  return { ...component, opmem };
};
