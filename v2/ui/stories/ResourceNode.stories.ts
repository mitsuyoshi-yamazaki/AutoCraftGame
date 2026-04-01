import type { Meta, StoryObj } from '@storybook/html-vite';
import type { ResourceNode } from '@/types.js';
import { createResourceNodeGraphics, createEmptyCellGraphics } from '../renderer.js';
import { createStoryApp, CELL_SIZE } from './helpers.js';

const meta: Meta = { title: 'Map/ResourceNode' };
export default meta;
type Story = StoryObj;

function renderNode(node: ResourceNode, maxRemaining = 50): HTMLElement {
  const wrapper = document.createElement('div');
  (async () => {
    const { app, container } = await createStoryApp(CELL_SIZE, CELL_SIZE);
    container.addChild(createResourceNodeGraphics(CELL_SIZE, node, maxRemaining));
    wrapper.appendChild(app.canvas as HTMLCanvasElement);
  })();
  return wrapper;
}

export const OreNodeFull: Story = {
  name: 'OreNode (full)',
  render: () => renderNode({ position: { x: 0, y: 0 }, type: 'OreNode', remaining: 50 }),
};

export const OreNodeHalf: Story = {
  name: 'OreNode (50%)',
  render: () => renderNode({ position: { x: 0, y: 0 }, type: 'OreNode', remaining: 25 }),
};

export const OreNodeLow: Story = {
  name: 'OreNode (10%)',
  render: () => renderNode({ position: { x: 0, y: 0 }, type: 'OreNode', remaining: 5 }),
};

export const CrystalNodeFull: Story = {
  name: 'CrystalNode (full)',
  render: () => renderNode({ position: { x: 0, y: 0 }, type: 'CrystalNode', remaining: 50 }),
};

export const CrystalNodeHalf: Story = {
  name: 'CrystalNode (50%)',
  render: () => renderNode({ position: { x: 0, y: 0 }, type: 'CrystalNode', remaining: 25 }),
};

export const CrystalNodeLow: Story = {
  name: 'CrystalNode (10%)',
  render: () => renderNode({ position: { x: 0, y: 0 }, type: 'CrystalNode', remaining: 5 }),
};

export const EmptyCell: Story = {
  render: () => {
    const wrapper = document.createElement('div');
    (async () => {
      const { app, container } = await createStoryApp(CELL_SIZE, CELL_SIZE);
      container.addChild(createEmptyCellGraphics(CELL_SIZE));
      wrapper.appendChild(app.canvas as HTMLCanvasElement);
    })();
    return wrapper;
  },
};
