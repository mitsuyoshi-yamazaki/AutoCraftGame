import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Character, ComponentType } from '@/types.js';
import { MIN_COMPONENTS } from '@/recipes.js';
import { drawCharacter, drawEmptyCell, drawResourceNode } from '../renderer.js';
import { createCellCanvas, CELL_SIZE } from './helpers.js';

const meta: Meta = {
  title: 'Map/Character',
};
export default meta;

type Story = StoryObj;

const DUMMY_PROGRAM = { rules: [{ condition: { op: 'true' as const }, action: { op: 'NOOP' as const } }] };

function makeChar(overrides: Partial<Character> & { id: string }): Character {
  return {
    position: { x: 0, y: 0 },
    components: [...MIN_COMPONENTS],
    inventory: {},
    durability: 100,
    program: DUMMY_PROGRAM,
    senseData: null,
    ...overrides,
  };
}

function renderCharOnEmpty(char: Character, selected: boolean): HTMLCanvasElement {
  const { canvas, ctx } = createCellCanvas(CELL_SIZE);
  drawEmptyCell(ctx, 0, 0, CELL_SIZE);
  drawCharacter(ctx, 0, 0, CELL_SIZE, char, selected);
  return canvas;
}

// --- Active character ---

export const Active: Story = {
  render: () => renderCharOnEmpty(
    makeChar({ id: 'char-001', durability: 100 }),
    false,
  ),
};

// --- Inactive character (no program) ---

export const Inactive: Story = {
  render: () => renderCharOnEmpty(
    makeChar({ id: 'char-002', program: null, durability: 100 }),
    false,
  ),
};

// --- Selected character ---

export const Selected: Story = {
  render: () => renderCharOnEmpty(
    makeChar({ id: 'char-001', durability: 80 }),
    true,
  ),
};

// --- Durability states ---

export const DurabilityFull: Story = {
  name: 'Durability 100%',
  render: () => renderCharOnEmpty(
    makeChar({ id: 'char-001', durability: 100 }),
    false,
  ),
};

export const DurabilityHalf: Story = {
  name: 'Durability 50%',
  render: () => renderCharOnEmpty(
    makeChar({ id: 'char-001', durability: 50 }),
    false,
  ),
};

export const DurabilityLow: Story = {
  name: 'Durability 10% (critical)',
  render: () => renderCharOnEmpty(
    makeChar({ id: 'char-001', durability: 10 }),
    false,
  ),
};

// --- Character on resource node ---

export const OnOreNode: Story = {
  name: 'Active on OreNode',
  render: () => {
    const { canvas, ctx } = createCellCanvas(CELL_SIZE);
    drawResourceNode(ctx, 0, 0, CELL_SIZE, {
      position: { x: 0, y: 0 },
      type: 'OreNode',
      depleted: false,
    });
    drawCharacter(ctx, 0, 0, CELL_SIZE, makeChar({ id: 'char-001' }), false);
    return canvas;
  },
};

export const OnCrystalNode: Story = {
  name: 'Active on CrystalNode',
  render: () => {
    const { canvas, ctx } = createCellCanvas(CELL_SIZE);
    drawResourceNode(ctx, 0, 0, CELL_SIZE, {
      position: { x: 0, y: 0 },
      type: 'CrystalNode',
      depleted: false,
    });
    drawCharacter(ctx, 0, 0, CELL_SIZE, makeChar({ id: 'char-001' }), false);
    return canvas;
  },
};
