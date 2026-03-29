import type { Meta, StoryObj } from '@storybook/html-vite';
import type { ResourceNode } from '@/types.js';
import { createResourceNodeGraphics, createEmptyCellGraphics } from '../renderer.js';
import { createStoryApp, CELL_SIZE } from './helpers.js';

const meta: Meta = {
  title: 'Map/ResourceNode',
};
export default meta;

type Story = StoryObj;

function renderNode(node: ResourceNode): HTMLElement {
  const wrapper = document.createElement('div');
  (async () => {
    const { app, container } = await createStoryApp(CELL_SIZE, CELL_SIZE);
    container.addChild(createResourceNodeGraphics(CELL_SIZE, node));
    wrapper.appendChild(app.canvas as HTMLCanvasElement);
  })();
  return wrapper;
}

export const OreNode: Story = {
  render: () => renderNode({ position: { x: 0, y: 0 }, type: 'OreNode', depleted: false }),
};

export const OreNodeDepleted: Story = {
  name: 'OreNode (depleted)',
  render: () => renderNode({ position: { x: 0, y: 0 }, type: 'OreNode', depleted: true }),
};

export const CrystalNode: Story = {
  render: () => renderNode({ position: { x: 0, y: 0 }, type: 'CrystalNode', depleted: false }),
};

export const CrystalNodeDepleted: Story = {
  name: 'CrystalNode (depleted)',
  render: () => renderNode({ position: { x: 0, y: 0 }, type: 'CrystalNode', depleted: true }),
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
