import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Character, ComponentType } from '@/types.js';
import { MIN_COMPONENTS } from '@/recipes.js';
import { createStoryApp, CELL_SIZE } from '../helpers.js';
import {
  createCharacterA,
  createCharacterB,
  createCharacterC,
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

// Characters to display in each row
const CHAR_VARIANTS: { label: string; char: Character }[] = [
  { label: 'Active 100%', char: makeChar({ id: 'c1', durability: 100 }) },
  { label: 'Active 60%', char: makeChar({ id: 'c2', durability: 60 }) },
  { label: 'Active 20%', char: makeChar({ id: 'c3', durability: 20 }) },
  { label: 'Inactive', char: makeChar({ id: 'c4', program: null, durability: 100 }) },
  {
    label: 'Minimal (Frame+Proc)',
    char: makeChar({
      id: 'c5',
      components: ['Frame', 'Processor'] as ComponentType[],
      durability: 80,
    }),
  },
  {
    label: '3x Frame',
    char: makeChar({
      id: 'c6',
      components: ['Frame', 'Frame', 'Frame', 'Actuator', 'Sensor', 'Processor', 'Harvester', 'Assembler', 'MemoryCore'] as ComponentType[],
      durability: 250,
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
  desc.style.cssText = 'font-family:monospace; font-size:12px; color:#999; margin-bottom:12px;';
  desc.textContent = description;
  wrapper.appendChild(desc);

  (async () => {
    const cols = CHAR_VARIANTS.length;
    const { app, container } = await createStoryApp(S * cols, S);

    for (let i = 0; i < cols; i++) {
      // Dark background per cell
      const bg = new (await import('pixi.js')).Graphics();
      bg.rect(i * S, 0, S, S).fill(0x1a2a1a);
      bg.rect(i * S, 0, S, S).stroke({ color: 0x333333, width: 0.5 });
      container.addChild(bg);

      const g = factory(S, CHAR_VARIANTS[i].char);
      g.x = i * S;
      g.y = 0;
      container.addChild(g);
    }

    wrapper.appendChild(app.canvas as HTMLCanvasElement);

    // Labels
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

// ============================================================
// Proposal A: Circle membrane + organelle dots
// ============================================================
export const ProposalA: Story = {
  name: 'A: Membrane + Organelles',
  render: () => renderProposal(
    'Proposal A: Circle Membrane + Organelle Dots',
    'Outer membrane thickness = durability. Inner colored dots = component types. Center dot = Processor.',
    createCharacterA,
  ),
};

// ============================================================
// Proposal B: Amoeba blob + scattered dots
// ============================================================
export const ProposalB: Story = {
  name: 'B: Amoeba Blob',
  render: () => renderProposal(
    'Proposal B: Amoeba Blob + Scattered Dots',
    'Irregular organic outline. Fill brightness = durability. Scattered dots = components.',
    createCharacterB,
  ),
};

// ============================================================
// Proposal C: Double circle + ring segments
// ============================================================
export const ProposalC: Story = {
  name: 'C: Nucleus + Ring Segments',
  render: () => renderProposal(
    'Proposal C: Nucleus + Component Ring',
    'Outer ring = colored arcs per component (missing arc = damage). Inner circle = processor nucleus.',
    createCharacterC,
  ),
};
