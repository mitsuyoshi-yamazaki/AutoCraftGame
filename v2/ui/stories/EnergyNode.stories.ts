import type { Meta, StoryObj } from '@storybook/html-vite';
import type { EnergyNode } from '@/types.js';
import { createEnergyNodeGraphics } from '../renderer.js';
import { createStoryApp, CELL_SIZE } from './helpers.js';

const meta: Meta = { title: 'Map/EnergyNode' };
export default meta;
type Story = StoryObj;

function renderNode(node: EnergyNode): HTMLElement {
  const wrapper = document.createElement('div');
  (async () => {
    const { app, container } = await createStoryApp(CELL_SIZE, CELL_SIZE);
    container.addChild(createEnergyNodeGraphics(CELL_SIZE, node));
    wrapper.appendChild(app.canvas as HTMLCanvasElement);
  })();
  return wrapper;
}

export const Full: Story = {
  name: 'EnergyNode (full)',
  render: () => renderNode({ position: { x: 0, y: 0 }, productionRate: 200, stored: 2000, maxStored: 2000 }),
};

export const Half: Story = {
  name: 'EnergyNode (50%)',
  render: () => renderNode({ position: { x: 0, y: 0 }, productionRate: 200, stored: 1000, maxStored: 2000 }),
};

export const Low: Story = {
  name: 'EnergyNode (10%)',
  render: () => renderNode({ position: { x: 0, y: 0 }, productionRate: 200, stored: 200, maxStored: 2000 }),
};

export const Empty: Story = {
  name: 'EnergyNode (empty)',
  render: () => renderNode({ position: { x: 0, y: 0 }, productionRate: 200, stored: 0, maxStored: 2000 }),
};
