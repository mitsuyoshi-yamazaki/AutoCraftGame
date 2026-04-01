import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Character, ResourceNode } from '@/types.js';
import { MIN_COMPONENTS } from '@/recipes.js';
import {
  createEmptyCellGraphics,
  createResourceNodeGraphics,
  createCharacterGraphics,
} from '../renderer.js';
import { createStoryApp } from './helpers.js';

const meta: Meta = {
  title: 'Map/GridOverview',
};
export default meta;

type Story = StoryObj;

const DUMMY_PROGRAM = { rules: [{ condition: { op: 'true' as const }, action: { op: 'NOOP' as const } }] };
const CELL = 32;
const GRID = 6;

function buildMiniWorld(): {
  nodes: ResourceNode[];
  characters: Character[];
} {
  const nodes: ResourceNode[] = [
    { position: { x: 0, y: 0 }, type: 'OreNode', depleted: false },
    { position: { x: 1, y: 0 }, type: 'OreNode', depleted: true },
    { position: { x: 4, y: 0 }, type: 'CrystalNode', depleted: false },
    { position: { x: 5, y: 0 }, type: 'CrystalNode', depleted: true },
    { position: { x: 0, y: 3 }, type: 'OreNode', depleted: false },
    { position: { x: 5, y: 3 }, type: 'CrystalNode', depleted: false },
  ];

  const characters: Character[] = [
    {
      id: 'char-001', position: { x: 2, y: 2 },
      components: [...MIN_COMPONENTS], inventory: {},
      durability: 90, program: DUMMY_PROGRAM, senseData: null,
    },
    {
      id: 'char-002', position: { x: 3, y: 2 },
      components: [...MIN_COMPONENTS], inventory: {},
      durability: 30, program: DUMMY_PROGRAM, senseData: null,
    },
    {
      id: 'char-003', position: { x: 3, y: 3 },
      components: [...MIN_COMPONENTS], inventory: {},
      durability: 100, program: null, senseData: null,
    },
    {
      id: 'char-004', position: { x: 0, y: 3 },
      components: [...MIN_COMPONENTS], inventory: {},
      durability: 50, program: DUMMY_PROGRAM, senseData: null,
    },
  ];

  return { nodes, characters };
}

export const Overview: Story = {
  render: () => {
    const wrapper = document.createElement('div');

    (async () => {
      const { app, container } = await createStoryApp(CELL * GRID, CELL * GRID);
      const { nodes, characters } = buildMiniWorld();

      const nodeMap = new Map<string, ResourceNode>();
      for (const n of nodes) nodeMap.set(`${n.position.x},${n.position.y}`, n);
      const charMap = new Map<string, Character>();
      for (const c of characters) charMap.set(`${c.position.x},${c.position.y}`, c);

      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const px = x * CELL;
          const py = y * CELL;
          const key = `${x},${y}`;

          const node = nodeMap.get(key);
          const cellG = node
            ? createResourceNodeGraphics(CELL, node)
            : createEmptyCellGraphics(CELL);
          cellG.x = px;
          cellG.y = py;
          container.addChild(cellG);

          const char = charMap.get(key);
          if (char) {
            const charG = createCharacterGraphics(CELL, char, char.id === 'char-001');
            charG.x = px;
            charG.y = py;
            container.addChild(charG);
          }
        }
      }

      wrapper.appendChild(app.canvas as HTMLCanvasElement);

      const legend = document.createElement('div');
      legend.style.cssText = 'margin-top:12px; font-family:monospace; font-size:13px; color:#ccc; line-height:1.8;';
      legend.innerHTML = [
        '<b>Legend:</b>',
        '(0,0) OreNode &nbsp; (1,0) OreNode depleted',
        '(4,0) CrystalNode &nbsp; (5,0) CrystalNode depleted',
        '(2,2) char-001: active, selected, dur 90%',
        '(3,2) char-002: active, dur 30% (critical)',
        '(3,3) char-003: inactive',
        '(0,3) char-004: active on OreNode, dur 50%',
      ].join('<br>');
      wrapper.appendChild(legend);
    })();

    return wrapper;
  },
};
