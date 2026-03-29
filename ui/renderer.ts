import { Application, Container, Graphics } from 'pixi.js';
import type { World, Character, ResourceNode, Position, ComponentType } from '@/types.js';
import { isActive } from '@/character.js';

// ============================================================
// Color constants
// ============================================================
export const COLORS = {
  empty: 0x1a2a1a,
  grid: 0x333333,
  ore: 0xe8b84b,
  crystal: 0x67d4e2,
  selected: 0xffd700,
  membrane: 0x26c6da,
  membraneInactive: 0x616161,
} as const;

export const COMPONENT_COLORS: Record<ComponentType, number> = {
  Frame: 0x78909c,
  Actuator: 0x66bb6a,
  Sensor: 0xffee58,
  Processor: 0xef5350,
  Harvester: 0x8d6e63,
  Assembler: 0x42a5f5,
  MemoryCore: 0xab47bc,
};

const DEPLETED_ALPHA = 0.3;
const INACTIVE_ALPHA = 0.65;

// ============================================================
// Empty cell
// ============================================================
export function createEmptyCellGraphics(size: number): Graphics {
  const g = new Graphics();
  g.rect(0, 0, size, size).fill(COLORS.empty);
  g.rect(0, 0, size, size).stroke({ color: COLORS.grid, width: 0.5 });
  return g;
}

// ============================================================
// ResourceNode — small rounded square + ring halo
// ============================================================
export function createResourceNodeGraphics(size: number, node: ResourceNode): Container {
  const c = new Container();
  const isOre = node.type === 'OreNode';
  const color = isOre ? COLORS.ore : COLORS.crystal;
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);

  // Background
  const bg = new Graphics();
  bg.rect(0, 0, size, size).fill(COLORS.empty);
  c.addChild(bg);

  // Halo (ring strokes) — only when not depleted
  if (!node.depleted) {
    const bodyR = size / 6;
    const halo = new Graphics();
    halo.circle(cx, cy, bodyR * 1.4).stroke({ color, width: 1.5, alpha: 0.25 });
    halo.circle(cx, cy, bodyR * 1.8).stroke({ color, width: 1.0, alpha: 0.12 });
    c.addChild(halo);
  }

  // Body — rounded square, ~1/3 of cell
  const bodySize = Math.round(size / 3);
  const offset = Math.floor((size - bodySize) / 2);
  const radius = bodySize * 0.2;
  const body = new Graphics();
  body.roundRect(offset, offset, bodySize, bodySize, radius).fill(color);
  body.alpha = node.depleted ? DEPLETED_ALPHA : 1;
  c.addChild(body);

  // Grid line
  const grid = new Graphics();
  grid.rect(0, 0, size, size).stroke({ color: COLORS.grid, width: 0.5 });
  c.addChild(grid);

  return c;
}

// ============================================================
// Character — nucleus + component ring + inventory arc
//
// - Outer ring: colored arc per component type (always fully drawn)
// - Nucleus: area shrinks with durability (r = maxR * sqrt(ratio))
// - Inventory: gray arc between nucleus and component ring
// ============================================================

/** Visual max for inventory fill gauge */
const INVENTORY_VISUAL_MAX = 34; // Ore x16 + Crystal x18

export function createCharacterGraphics(
  size: number,
  char: Character,
  selected: boolean,
): Container {
  const container = new Container();
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  const active = isActive(char);
  const ratio = durRatio(char);
  const outerR = size * 0.4;
  const maxNucleusR = size * 0.18;
  const ringWidth = size * 0.07;

  // Cytoplasm (background fill)
  const cyto = new Graphics();
  cyto.circle(cx, cy, outerR);
  cyto.fill({ color: active ? 0x1a3a4a : 0x2a2a2a, alpha: active ? 0.35 : 0.12 });
  container.addChild(cyto);

  // Component ring (always full)
  const counts = componentCounts(char);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  if (total > 0) {
    const ring = new Graphics();
    let currentAngle = -Math.PI / 2;
    for (const [type, count] of counts) {
      const arcAngle = (Math.PI * 2 * count) / total;
      const color = active ? COMPONENT_COLORS[type] : 0x666666;
      ring.arc(cx, cy, outerR - ringWidth / 2, currentAngle, currentAngle + arcAngle);
      ring.stroke({ color, width: ringWidth, alpha: active ? 0.85 : 0.35 });
      currentAngle += arcAngle;
    }
    container.addChild(ring);
  }

  // Selection ring
  if (selected) {
    const sel = new Graphics();
    sel.circle(cx, cy, outerR + 2).stroke({ color: COLORS.selected, width: 2, alpha: 0.9 });
    container.addChild(sel);
  }

  // Inventory arc — between nucleus and component ring
  const invTotal = Object.values(char.inventory).reduce((s, n) => s + n, 0);
  const invRatio = Math.min(1, invTotal / INVENTORY_VISUAL_MAX);
  if (invRatio > 0) {
    const invR = (maxNucleusR + outerR - ringWidth) / 2;
    const invAngle = Math.PI * 2 * invRatio;
    const inv = new Graphics();
    inv.arc(cx, cy, invR, -Math.PI / 2, -Math.PI / 2 + invAngle);
    inv.stroke({
      color: active ? 0xaaaaaa : 0x555555,
      width: size * 0.04,
      alpha: active ? 0.4 : 0.2,
    });
    container.addChild(inv);
  }

  // Nucleus — area proportional to durability: r = maxR * sqrt(ratio)
  const nucleusR = maxNucleusR * Math.sqrt(ratio);
  const nucleusColor = active
    ? (char.components.includes('Processor') ? COMPONENT_COLORS.Processor : 0x555555)
    : 0x555555;

  if (nucleusR > 0.5) {
    const nucleus = new Graphics();
    nucleus.circle(cx, cy, nucleusR);
    nucleus.fill({ color: nucleusColor, alpha: active ? 0.8 : 0.3 });
    container.addChild(nucleus);
  }

  // MemoryCore dot
  if (char.components.includes('MemoryCore') && nucleusR > 1) {
    const mcR = Math.max(size * 0.02, size * 0.035 * Math.sqrt(ratio));
    const mcOffset = nucleusR * 0.4;
    const mc = new Graphics();
    mc.circle(cx, cy - mcOffset, mcR);
    mc.fill({ color: active ? COMPONENT_COLORS.MemoryCore : 0x777777, alpha: 0.9 });
    container.addChild(mc);
  }

  if (!active) container.alpha = INACTIVE_ALPHA;

  return container;
}

// ============================================================
// Helpers
// ============================================================
function durRatio(char: Character): number {
  const maxDur = char.components.filter((c) => c === 'Frame').length * 100;
  return maxDur > 0 ? Math.max(0, Math.min(1, char.durability / maxDur)) : 0;
}

function componentCounts(char: Character): [ComponentType, number][] {
  const map = new Map<ComponentType, number>();
  for (const c of char.components) {
    map.set(c, (map.get(c) ?? 0) + 1);
  }
  return Array.from(map.entries());
}

// ============================================================
// Renderer class
// ============================================================
export class Renderer {
  readonly app: Application;
  private cellSize = 0;
  private gridContainer = new Container();

  constructor() {
    this.app = new Application();
  }

  async init(container: HTMLElement): Promise<void> {
    await this.app.init({
      background: COLORS.empty,
      resizeTo: container,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    container.appendChild(this.app.canvas);
    this.app.stage.addChild(this.gridContainer);
  }

  draw(world: World, selectedId: string | null): void {
    const canvasW = this.app.canvas.clientWidth;
    const canvasH = this.app.canvas.clientHeight;
    const cellSize = Math.floor(Math.min(canvasW, canvasH) / Math.max(world.width, world.height));
    this.cellSize = cellSize;

    this.gridContainer.removeChildren();

    const totalW = cellSize * world.width;
    const totalH = cellSize * world.height;
    this.gridContainer.x = Math.floor((canvasW - totalW) / 2);
    this.gridContainer.y = Math.floor((canvasH - totalH) / 2);

    const nodeMap = new Map<string, ResourceNode>();
    for (const node of world.resourceNodes) {
      nodeMap.set(posKey(node.position), node);
    }
    const charMap = new Map<string, Character>();
    for (const char of world.characters) {
      charMap.set(posKey(char.position), char);
    }

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const px = x * cellSize;
        const py = y * cellSize;
        const key = `${x},${y}`;

        const node = nodeMap.get(key);
        const cellGraphics = node
          ? createResourceNodeGraphics(cellSize, node)
          : createEmptyCellGraphics(cellSize);
        cellGraphics.x = px;
        cellGraphics.y = py;
        this.gridContainer.addChild(cellGraphics);

        const char = charMap.get(key);
        if (char) {
          const charGraphics = createCharacterGraphics(cellSize, char, char.id === selectedId);
          charGraphics.x = px;
          charGraphics.y = py;
          this.gridContainer.addChild(charGraphics);
        }
      }
    }
  }

  hitTest(world: World, globalX: number, globalY: number): Character | null {
    const localX = globalX - this.gridContainer.x;
    const localY = globalY - this.gridContainer.y;
    const gridX = Math.floor(localX / this.cellSize);
    const gridY = Math.floor(localY / this.cellSize);
    return world.characters.find(
      (c) => c.position.x === gridX && c.position.y === gridY,
    ) ?? null;
  }
}

function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}
