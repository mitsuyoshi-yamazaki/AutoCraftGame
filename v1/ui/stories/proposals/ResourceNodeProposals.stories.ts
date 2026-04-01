import type { Meta, StoryObj } from '@storybook/html-vite';
import type { ResourceNode } from '@/types.js';
import { createStoryApp, CELL_SIZE } from '../helpers.js';
import {
  createResourceNodeA,
  createResourceNodeB,
  createResourceNodeC,
} from './resource-node-proposals.js';

const meta: Meta = {
  title: 'Proposals/ResourceNode',
};
export default meta;

type Story = StoryObj;

const S = CELL_SIZE;
const COLS = 4;
const LABELS = ['Ore', 'Ore (depleted)', 'Crystal', 'Crystal (depleted)'];

function makeNodes(): ResourceNode[] {
  return [
    { position: { x: 0, y: 0 }, type: 'OreNode', depleted: false },
    { position: { x: 1, y: 0 }, type: 'OreNode', depleted: true },
    { position: { x: 2, y: 0 }, type: 'CrystalNode', depleted: false },
    { position: { x: 3, y: 0 }, type: 'CrystalNode', depleted: true },
  ];
}

function renderProposal(
  name: string,
  description: string,
  factory: (size: number, node: ResourceNode) => any,
): HTMLElement {
  const wrapper = document.createElement('div');

  // Title
  const title = document.createElement('div');
  title.style.cssText = 'font-family:monospace; font-size:14px; color:#eee; margin-bottom:8px; font-weight:bold;';
  title.textContent = name;
  wrapper.appendChild(title);

  // Description
  const desc = document.createElement('div');
  desc.style.cssText = 'font-family:monospace; font-size:12px; color:#999; margin-bottom:12px;';
  desc.textContent = description;
  wrapper.appendChild(desc);

  // Canvas
  (async () => {
    const { app, container } = await createStoryApp(S * COLS, S);
    const nodes = makeNodes();
    for (let i = 0; i < nodes.length; i++) {
      const g = factory(S, nodes[i]);
      g.x = i * S;
      g.y = 0;
      container.addChild(g);
    }
    wrapper.appendChild(app.canvas as HTMLCanvasElement);

    // Labels
    const labelRow = document.createElement('div');
    labelRow.style.cssText = `display:flex; width:${S * COLS}px; font-family:monospace; font-size:11px; color:#888;`;
    for (const label of LABELS) {
      const span = document.createElement('span');
      span.style.cssText = `width:${S}px; text-align:center; padding-top:4px;`;
      span.textContent = label;
      labelRow.appendChild(span);
    }
    wrapper.appendChild(labelRow);
  })();

  return wrapper;
}

// ============================================================
// Proposal A: Rounded rect + diagonal veins
// ============================================================
export const ProposalA: Story = {
  name: 'A: Rounded Rect + Veins',
  render: () => renderProposal(
    'Proposal A: Rounded Rect + Diagonal Veins',
    'Cross-section of a mineral deposit. Diagonal vein lines show richness.',
    createResourceNodeA,
  ),
};

// ============================================================
// Proposal B: Hexagonal + crystal dots
// ============================================================
export const ProposalB: Story = {
  name: 'B: Hexagonal + Crystal Dots',
  render: () => renderProposal(
    'Proposal B: Hexagonal + Crystal Dots',
    'Crystalline mineral structure. Hexagonal outline with inner dot pattern.',
    createResourceNodeB,
  ),
};

// ============================================================
// Proposal C: Block cluster
// ============================================================
export const ProposalC: Story = {
  name: 'C: Block Cluster',
  render: () => renderProposal(
    'Proposal C: Block Cluster',
    'Open-pit mining blocks. Irregular cluster of small rectangles.',
    createResourceNodeC,
  ),
};
