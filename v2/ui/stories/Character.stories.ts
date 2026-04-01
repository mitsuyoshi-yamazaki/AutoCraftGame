import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Character } from '@/types.js';
import { MIN_COMPONENTS } from '@/recipes.js';
import { FRAME_DURABILITY } from '@/constants.js';
import {
  createEmptyCellGraphics,
  createCharacterGraphics,
  createResourceNodeGraphics,
  createEnergyNodeGraphics,
} from '../renderer.js';
import { createStoryApp, CELL_SIZE } from './helpers.js';

const meta: Meta = { title: 'Map/Character' };
export default meta;
type Story = StoryObj;

const DUMMY_PROGRAM = { rules: [{ condition: { op: 'true' as const }, action: { op: 'NOOP' as const } }] };

function makeChar(overrides: Partial<Character> & { id: string }): Character {
  return {
    position: { x: 0, y: 0 },
    components: [...MIN_COMPONENTS],
    inventory: {},
    durability: FRAME_DURABILITY,
    energy: 3000,
    program: DUMMY_PROGRAM,
    senseData: null,
    ...overrides,
  };
}

function renderCharStory(char: Character, selected = false): HTMLElement {
  const wrapper = document.createElement('div');
  (async () => {
    const { app, container } = await createStoryApp(CELL_SIZE, CELL_SIZE);
    container.addChild(createEmptyCellGraphics(CELL_SIZE));
    container.addChild(createCharacterGraphics(CELL_SIZE, char, selected));
    wrapper.appendChild(app.canvas as HTMLCanvasElement);
  })();
  return wrapper;
}

export const Active: Story = {
  render: () => renderCharStory(makeChar({ id: 'c1' })),
};

export const Inactive: Story = {
  render: () => renderCharStory(makeChar({ id: 'c2', program: null })),
};

export const Selected: Story = {
  render: () => renderCharStory(makeChar({ id: 'c1' }), true),
};

export const DurabilityFull: Story = {
  name: 'Durability 100%',
  render: () => renderCharStory(makeChar({ id: 'c1', durability: FRAME_DURABILITY })),
};

export const DurabilityHalf: Story = {
  name: 'Durability 50%',
  render: () => renderCharStory(makeChar({ id: 'c1', durability: FRAME_DURABILITY / 2 })),
};

export const DurabilityLow: Story = {
  name: 'Durability 10%',
  render: () => renderCharStory(makeChar({ id: 'c1', durability: FRAME_DURABILITY * 0.1 })),
};

export const EnergyFull: Story = {
  name: 'Energy high',
  render: () => renderCharStory(makeChar({ id: 'c1', energy: 5000 })),
};

export const EnergyLow: Story = {
  name: 'Energy low',
  render: () => renderCharStory(makeChar({ id: 'c1', energy: 500 })),
};

export const EnergyZero: Story = {
  name: 'Energy zero',
  render: () => renderCharStory(makeChar({ id: 'c1', energy: 0 })),
};

export const WithDisassembler: Story = {
  name: 'With Disassembler',
  render: () => renderCharStory(makeChar({
    id: 'c1',
    components: [...MIN_COMPONENTS, 'Disassembler'],
  })),
};

export const WithInventory: Story = {
  name: 'With inventory',
  render: () => renderCharStory(makeChar({
    id: 'c1',
    inventory: { Ore: 8, Crystal: 6, Metal: 4 },
  })),
};

export const NextToOreNode: Story = {
  name: 'Next to OreNode',
  render: () => {
    const wrapper = document.createElement('div');
    (async () => {
      const { app, container } = await createStoryApp(CELL_SIZE * 2, CELL_SIZE);
      container.addChild(createResourceNodeGraphics(CELL_SIZE, {
        position: { x: 0, y: 0 }, type: 'OreNode', remaining: 50,
      }));
      const charG = createCharacterGraphics(CELL_SIZE, makeChar({ id: 'c1' }), false);
      charG.x = CELL_SIZE;
      container.addChild(createEmptyCellGraphics(CELL_SIZE)).x = CELL_SIZE;
      container.addChild(charG);
      wrapper.appendChild(app.canvas as HTMLCanvasElement);
    })();
    return wrapper;
  },
};
