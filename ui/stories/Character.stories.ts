import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Character } from '@/types.js';
import { MIN_COMPONENTS } from '@/recipes.js';
import {
  createEmptyCellGraphics,
  createResourceNodeGraphics,
  createCharacterGraphics,
} from '../renderer.js';
import { createStoryApp, CELL_SIZE } from './helpers.js';

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

function renderCharStory(char: Character, selected: boolean): HTMLElement {
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
  render: () => renderCharStory(makeChar({ id: 'char-001', durability: 100 }), false),
};

export const Inactive: Story = {
  render: () => renderCharStory(makeChar({ id: 'char-002', program: null, durability: 100 }), false),
};

export const Selected: Story = {
  render: () => renderCharStory(makeChar({ id: 'char-001', durability: 80 }), true),
};

export const DurabilityFull: Story = {
  name: 'Durability 100%',
  render: () => renderCharStory(makeChar({ id: 'char-001', durability: 100 }), false),
};

export const DurabilityHalf: Story = {
  name: 'Durability 50%',
  render: () => renderCharStory(makeChar({ id: 'char-001', durability: 50 }), false),
};

export const DurabilityLow: Story = {
  name: 'Durability 10% (critical)',
  render: () => renderCharStory(makeChar({ id: 'char-001', durability: 10 }), false),
};

export const OnOreNode: Story = {
  name: 'Active on OreNode',
  render: () => {
    const wrapper = document.createElement('div');
    (async () => {
      const { app, container } = await createStoryApp(CELL_SIZE, CELL_SIZE);
      container.addChild(createResourceNodeGraphics(CELL_SIZE, {
        position: { x: 0, y: 0 }, type: 'OreNode', depleted: false,
      }));
      container.addChild(createCharacterGraphics(CELL_SIZE, makeChar({ id: 'char-001' }), false));
      wrapper.appendChild(app.canvas as HTMLCanvasElement);
    })();
    return wrapper;
  },
};

export const OnCrystalNode: Story = {
  name: 'Active on CrystalNode',
  render: () => {
    const wrapper = document.createElement('div');
    (async () => {
      const { app, container } = await createStoryApp(CELL_SIZE, CELL_SIZE);
      container.addChild(createResourceNodeGraphics(CELL_SIZE, {
        position: { x: 0, y: 0 }, type: 'CrystalNode', depleted: false,
      }));
      container.addChild(createCharacterGraphics(CELL_SIZE, makeChar({ id: 'char-001' }), false));
      wrapper.appendChild(app.canvas as HTMLCanvasElement);
    })();
    return wrapper;
  },
};
