import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Character, ComponentType } from '@/types.js';
import { MIN_COMPONENTS } from '@/recipes.js';
import { Graphics } from 'pixi.js';
import { createStoryApp, CELL_SIZE } from '../helpers.js';
import {
  createCharacterC1,
  createCharacterC2,
  createCharacterC3,
} from './character-proposals.js';

const meta: Meta = {
  title: 'Proposals/Character',
};
export default meta;

type Story = StoryObj;

const S = CELL_SIZE;
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

const CHAR_VARIANTS: { label: string; char: Character }[] = [
  {
    label: '100% / empty inv',
    char: makeChar({ id: 'c1', durability: 100 }),
  },
  {
    label: '100% / half inv',
    char: makeChar({ id: 'c2', durability: 100, inventory: { Ore: 8, Crystal: 9 } }),
  },
  {
    label: '100% / full inv',
    char: makeChar({ id: 'c3', durability: 100, inventory: { Ore: 16, Crystal: 18 } }),
  },
  {
    label: '50% / half inv',
    char: makeChar({ id: 'c4', durability: 50, inventory: { Metal: 4, Circuit: 5 } }),
  },
  {
    label: '15% / empty inv',
    char: makeChar({ id: 'c5', durability: 15 }),
  },
  {
    label: 'Inactive',
    char: makeChar({ id: 'c6', program: null, durability: 100 }),
  },
  {
    label: 'Minimal (F+P)',
    char: makeChar({
      id: 'c7',
      components: ['Frame', 'Processor'] as ComponentType[],
      durability: 80,
      inventory: { Ore: 4 },
    }),
  },
];

function renderProposal(
  name: string,
  description: string,
  factory: (size: number, char: Character) => any,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin-bottom:24px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-family:monospace; font-size:14px; color:#eee; margin-bottom:4px; font-weight:bold;';
  title.textContent = name;
  wrapper.appendChild(title);

  const desc = document.createElement('div');
  desc.style.cssText = 'font-family:monospace; font-size:12px; color:#999; margin-bottom:12px; line-height:1.5;';
  desc.innerHTML = description;
  wrapper.appendChild(desc);

  (async () => {
    const cols = CHAR_VARIANTS.length;
    const { app, container } = await createStoryApp(S * cols, S);

    for (let i = 0; i < cols; i++) {
      const bg = new Graphics();
      bg.rect(i * S, 0, S, S).fill(0x1a2a1a);
      bg.rect(i * S, 0, S, S).stroke({ color: 0x333333, width: 0.5 });
      container.addChild(bg);

      const g = factory(S, CHAR_VARIANTS[i].char);
      g.x = i * S;
      g.y = 0;
      container.addChild(g);
    }

    wrapper.appendChild(app.canvas as HTMLCanvasElement);

    const labelRow = document.createElement('div');
    labelRow.style.cssText = `display:flex; width:${S * cols}px; font-family:monospace; font-size:10px; color:#888;`;
    for (const v of CHAR_VARIANTS) {
      const span = document.createElement('span');
      span.style.cssText = `width:${S}px; text-align:center; padding-top:4px; line-height:1.3;`;
      span.textContent = v.label;
      labelRow.appendChild(span);
    }
    wrapper.appendChild(labelRow);
  })();

  return wrapper;
}

export const ProposalC1: Story = {
  name: 'C1: Durability outline + Nucleus fill',
  render: () => renderProposal(
    'C1: Durability outline + Nucleus fill = inventory',
    'Component ring: always full.<br>Durability: cytoplasm opacity fades + thin white arc shows remaining HP.<br>Inventory: nucleus fills bottom-up.',
    createCharacterC1,
  ),
};

export const ProposalC2: Story = {
  name: 'C2: Ring brightness + Inventory dots',
  render: () => renderProposal(
    'C2: Ring brightness = durability, scattered dots = inventory',
    'Component ring: always drawn, alpha dims with low HP.<br>Inventory: small dots appear between nucleus and ring (up to 12).',
    createCharacterC2,
  ),
};

export const ProposalC3: Story = {
  name: 'C3: Shrinking membrane + Inventory arc',
  render: () => renderProposal(
    'C3: Inner membrane shrinks = durability, arc ring = inventory',
    'Component ring: always full, fixed alpha.<br>Durability: inner membrane circle shrinks toward nucleus.<br>Inventory: gray arc between nucleus and ring fills clockwise.',
    createCharacterC3,
  ),
};
