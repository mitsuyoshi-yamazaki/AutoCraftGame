import type { Meta, StoryObj } from '@storybook/html-vite';
import type { ResourceNode } from '@/types.js';
import {
  createEmptyCellGraphics,
  createResourceNodeGraphics,
} from '../renderer.js';
import { createStoryApp, CELL_SIZE } from './helpers.js';

const meta: Meta = {
  title: 'Map/ResourceNode',
};
export default meta;

type Story = StoryObj;

async function renderNode(node: ResourceNode): Promise<HTMLCanvasElement> {
  const { app, container } = await createStoryApp(CELL_SIZE, CELL_SIZE);
  container.addChild(createResourceNodeGraphics(CELL_SIZE, node));
  return app.canvas as HTMLCanvasElement;
}

// --- OreNode ---

export const OreNode: Story = {
  render: () => {
    const wrapper = document.createElement('div');
    renderNode({ position: { x: 0, y: 0 }, type: 'OreNode', depleted: false })
      .then((c) => wrapper.appendChild(c));
    return wrapper;
  },
};

export const OreNodeDepleted: Story = {
  name: 'OreNode (depleted)',
  render: () => {
    const wrapper = document.createElement('div');
    renderNode({ position: { x: 0, y: 0 }, type: 'OreNode', depleted: true })
      .then((c) => wrapper.appendChild(c));
    return wrapper;
  },
};

// --- CrystalNode ---

export const CrystalNode: Story = {
  name: 'CrystalNode',
  render: () => {
    const wrapper = document.createElement('div');
    renderNode({ position: { x: 0, y: 0 }, type: 'CrystalNode', depleted: false })
      .then((c) => wrapper.appendChild(c));
    return wrapper;
  },
};

export const CrystalNodeDepleted: Story = {
  name: 'CrystalNode (depleted)',
  render: () => {
    const wrapper = document.createElement('div');
    renderNode({ position: { x: 0, y: 0 }, type: 'CrystalNode', depleted: true })
      .then((c) => wrapper.appendChild(c));
    return wrapper;
  },
};

// --- Empty cell ---

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
