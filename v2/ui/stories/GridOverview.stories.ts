import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Character, ResourceNode, EnergyNode, Remains } from '@/types.js';
import { MIN_COMPONENTS } from '@/recipes.js';
import { FRAME_DURABILITY } from '@/constants.js';
import {
  createEmptyCellGraphics,
  createResourceNodeGraphics,
  createEnergyNodeGraphics,
  createRemainsGraphics,
  createCharacterGraphics,
} from '../renderer.js';
import { createStoryApp } from './helpers.js';

const meta: Meta = { title: 'Map/GridOverview' };
export default meta;
type Story = StoryObj;

const DUMMY_PROGRAM = { rules: [{ condition: { op: 'true' as const }, action: { op: 'NOOP' as const } }] };
const CELL = 32;
const GRID = 8;

function buildMiniWorld() {
  const resourceNodes: ResourceNode[] = [
    { position: { x: 0, y: 0 }, type: 'OreNode', remaining: 50 },
    { position: { x: 1, y: 0 }, type: 'OreNode', remaining: 10 },
    { position: { x: 6, y: 0 }, type: 'CrystalNode', remaining: 50 },
    { position: { x: 7, y: 0 }, type: 'CrystalNode', remaining: 5 },
    { position: { x: 0, y: 4 }, type: 'OreNode', remaining: 30 },
    { position: { x: 7, y: 4 }, type: 'CrystalNode', remaining: 40 },
  ];

  const energyNodes: EnergyNode[] = [
    { position: { x: 3, y: 0 }, productionRate: 200, stored: 2000, maxStored: 2000 },
    { position: { x: 4, y: 0 }, productionRate: 200, stored: 500, maxStored: 2000 },
    { position: { x: 3, y: 7 }, productionRate: 200, stored: 0, maxStored: 2000 },
  ];

  const remains: Remains[] = [
    { position: { x: 5, y: 3 }, components: ['Frame', 'Processor', 'Assembler'], inventory: { Ore: 2 } },
    { position: { x: 6, y: 5 }, components: ['Frame'], inventory: {} },
  ];

  const characters: Character[] = [
    {
      id: 'char-001', position: { x: 2, y: 2 },
      components: [...MIN_COMPONENTS], inventory: {},
      durability: FRAME_DURABILITY, energy: 4000,
      program: DUMMY_PROGRAM, senseData: null,
    },
    {
      id: 'char-002', position: { x: 4, y: 3 },
      components: [...MIN_COMPONENTS], inventory: { Ore: 5, Crystal: 3 },
      durability: FRAME_DURABILITY * 0.3, energy: 800,
      program: DUMMY_PROGRAM, senseData: null,
    },
    {
      id: 'char-003', position: { x: 5, y: 5 },
      components: [...MIN_COMPONENTS], inventory: {},
      durability: FRAME_DURABILITY, energy: 2000,
      program: null, senseData: null,
    },
    {
      id: 'char-004', position: { x: 1, y: 4 },
      components: [...MIN_COMPONENTS, 'Disassembler'], inventory: { Metal: 6 },
      durability: FRAME_DURABILITY * 0.6, energy: 3000,
      program: DUMMY_PROGRAM, senseData: null,
    },
  ];

  return { resourceNodes, energyNodes, remains, characters };
}

export const Overview: Story = {
  render: () => {
    const wrapper = document.createElement('div');

    (async () => {
      const { app, container } = await createStoryApp(CELL * GRID, CELL * GRID);
      const { resourceNodes, energyNodes, remains, characters } = buildMiniWorld();

      const nodeMap = new Map<string, ResourceNode>();
      for (const n of resourceNodes) nodeMap.set(`${n.position.x},${n.position.y}`, n);
      const energyMap = new Map<string, EnergyNode>();
      for (const n of energyNodes) energyMap.set(`${n.position.x},${n.position.y}`, n);
      const remainsMap = new Map<string, Remains>();
      for (const r of remains) remainsMap.set(`${r.position.x},${r.position.y}`, r);
      const charMap = new Map<string, Character>();
      for (const c of characters) charMap.set(`${c.position.x},${c.position.y}`, c);

      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const px = x * CELL;
          const py = y * CELL;
          const key = `${x},${y}`;

          const rNode = nodeMap.get(key);
          const eNode = energyMap.get(key);
          const rem = remainsMap.get(key);

          let cellG;
          if (rNode) cellG = createResourceNodeGraphics(CELL, rNode);
          else if (eNode) cellG = createEnergyNodeGraphics(CELL, eNode);
          else if (rem) cellG = createRemainsGraphics(CELL, rem);
          else cellG = createEmptyCellGraphics(CELL);
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
        '(0,0) OreNode full &nbsp; (1,0) OreNode 20%',
        '(6,0) CrystalNode full &nbsp; (7,0) CrystalNode 10%',
        '(3,0) EnergyNode full &nbsp; (4,0) EnergyNode 25% &nbsp; (3,7) EnergyNode empty',
        '(5,3) Remains (3 components + inventory) &nbsp; (6,5) Remains (1 component)',
        '(2,2) char-001: active, selected, full health/energy',
        '(4,3) char-002: active, dur 30%, energy low, with inventory',
        '(5,5) char-003: inactive',
        '(1,4) char-004: active with Disassembler, dur 60%',
      ].join('<br>');
      wrapper.appendChild(legend);
    })();

    return wrapper;
  },
};
