/**
 * 数値コード体系とクラフトデータへの橋渡し。仕様: docs/specs/03_program_io.md
 */

import { atomCount } from '../craft/atoms';
import { RECIPES, RECIPE_CODES } from '../craft/recipes';
import { SUBSTANCES, SUBSTANCE_CODES, SUBSTANCE_MAP } from '../craft/substances';
import type { Recipe, Substance } from '../craft/types';
import type { ComponentObject, ComponentType, WorldObject } from './types';

// === 種別コード ===

export const TYPE_CODE_BY_COMPONENT: Readonly<Record<ComponentType, number>> = {
  Assembler: 1,
  Processor: 2,
  MemoryCore: 3,
  Actuator: 4,
  Sensor: 5,
  Harvester: 6,
  Disassembler: 7,
  Storage: 8,
};

export const TYPE_CODE_ENERGY_NODE = 20;
export const TYPE_CODE_GROUP = 30;
export const TYPE_CODE_SUBSTANCE_BASE = 100;

export const typeCodeOf = (obj: WorldObject): number => {
  switch (obj.kind) {
    case 'component':
      return TYPE_CODE_BY_COMPONENT[obj.componentType];
    case 'energyNode':
    case 'energyPile':
      return TYPE_CODE_ENERGY_NODE;
    case 'group':
      return TYPE_CODE_GROUP;
    case 'matterNode':
    case 'ground':
      return TYPE_CODE_SUBSTANCE_BASE + obj.substanceCode;
  }
};

// === 物質コード ===

const SUBSTANCE_BY_CODE: ReadonlyMap<number, Substance> = new Map(
  SUBSTANCES.map((substance, index) => [index + 1, substance]),
);

export const substanceByCode = (code: number): Substance | undefined => SUBSTANCE_BY_CODE.get(code);

export const substanceCodeOf = (substanceId: string): number => {
  const code = SUBSTANCE_CODES.get(substanceId);
  if (code === undefined) {
    throw new Error(`未定義の物質: ${substanceId}`);
  }
  return code;
};

/** 物質1個あたりの原子数（=質量、=Storage容量の消費量） */
export const atomsPerUnit = (substanceCode: number): number => {
  const substance = SUBSTANCE_BY_CODE.get(substanceCode);
  return substance === undefined ? 0 : atomCount(substance.composition);
};

// === レシピコード ===

const RECIPE_BY_CODE: ReadonlyMap<number, Recipe> = new Map(
  RECIPES.map((recipe, index) => [index + 1, recipe]),
);

export const recipeByCode = (code: number): Recipe | undefined => RECIPE_BY_CODE.get(code);

export const recipeCodeOf = (recipeId: string): number => {
  const code = RECIPE_CODES.get(recipeId);
  if (code === undefined) {
    throw new Error(`未定義のレシピ: ${recipeId}`);
  }
  return code;
};

// === コンポーネント⇔物質 ===

export const componentSubstanceCode = (componentType: ComponentType): number =>
  substanceCodeOf(componentType);

/** コンポーネント種別に対応する分解（RX）レシピ */
export const disassemblyRecipeFor = (componentType: ComponentType): Recipe => {
  const recipe = RECIPES.find(
    candidate =>
      candidate.kind === 'disassembly' &&
      candidate.inputs.some(input => input.substanceId === componentType),
  );
  if (recipe === undefined) {
    throw new Error(`${componentType} の分解レシピがない`);
  }
  return recipe;
};

/** 修理材料（docs/specs/02_components.md） */
export const REPAIR_MATERIAL: Readonly<Record<ComponentType, string>> = {
  Assembler: 'ChargedBinder',
  Disassembler: 'ChargedBinder',
  Processor: 'EncodedFragment',
  MemoryCore: 'EncodedFragment',
  Actuator: 'ConductiveGel',
  Sensor: 'PatternChain',
  Harvester: 'ConductiveGel',
  Storage: 'BindingShard',
};

/** コンポーネントの質量（原子数） */
export const componentMass = (component: ComponentObject): number =>
  atomsPerUnit(substanceCodeOf(component.componentType));

export { SUBSTANCE_MAP };
