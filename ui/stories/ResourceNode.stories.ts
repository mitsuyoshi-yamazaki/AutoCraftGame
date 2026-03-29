import type { Meta, StoryObj } from '@storybook/html-vite';
import type { ResourceNode } from '@/types.js';
import { drawResourceNode, drawEmptyCell } from '../renderer.js';
import { createCellCanvas, CELL_SIZE } from './helpers.js';

const meta: Meta = {
  title: 'Map/ResourceNode',
};
export default meta;

type Story = StoryObj;

function renderNode(node: ResourceNode): HTMLCanvasElement {
  const { canvas, ctx } = createCellCanvas(CELL_SIZE);
  drawResourceNode(ctx, 0, 0, CELL_SIZE, node);
  return canvas;
}

// --- OreNode ---

export const OreNode: Story = {
  render: () => renderNode({
    position: { x: 0, y: 0 },
    type: 'OreNode',
    depleted: false,
  }),
};

export const OreNodeDepleted: Story = {
  name: 'OreNode (depleted)',
  render: () => renderNode({
    position: { x: 0, y: 0 },
    type: 'OreNode',
    depleted: true,
  }),
};

// --- CrystalNode ---

export const CrystalNode: Story = {
  render: () => renderNode({
    position: { x: 0, y: 0 },
    type: 'CrystalNode',
    depleted: false,
  }),
};

export const CrystalNodeDepleted: Story = {
  name: 'CrystalNode (depleted)',
  render: () => renderNode({
    position: { x: 0, y: 0 },
    type: 'CrystalNode',
    depleted: true,
  }),
};

// --- Empty cell ---

export const EmptyCell: Story = {
  render: () => {
    const { canvas, ctx } = createCellCanvas(CELL_SIZE);
    drawEmptyCell(ctx, 0, 0, CELL_SIZE);
    return canvas;
  },
};
