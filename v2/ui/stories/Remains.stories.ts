import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Remains } from '@/types.js';
import { createRemainsGraphics } from '../renderer.js';
import { createStoryApp, CELL_SIZE } from './helpers.js';

const meta: Meta = { title: 'Map/Remains' };
export default meta;
type Story = StoryObj;

function renderRemains(remains: Remains): HTMLElement {
  const wrapper = document.createElement('div');
  (async () => {
    const { app, container } = await createStoryApp(CELL_SIZE, CELL_SIZE);
    container.addChild(createRemainsGraphics(CELL_SIZE, remains));
    wrapper.appendChild(app.canvas as HTMLCanvasElement);
  })();
  return wrapper;
}

export const FullRemains: Story = {
  name: 'Remains (full body)',
  render: () => renderRemains({
    position: { x: 0, y: 0 },
    components: ['Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'Charger', 'MemoryCore'],
    inventory: { Ore: 3, Metal: 2 },
  }),
};

export const PartialRemains: Story = {
  name: 'Remains (partially looted)',
  render: () => renderRemains({
    position: { x: 0, y: 0 },
    components: ['Frame', 'Processor'],
    inventory: {},
  }),
};

export const NearlyEmpty: Story = {
  name: 'Remains (nearly empty)',
  render: () => renderRemains({
    position: { x: 0, y: 0 },
    components: ['Frame'],
    inventory: {},
  }),
};
