import { Application, Container, Graphics } from 'pixi.js';
import type { World, Character, ResourceNode, Position } from '@/types.js';
import { isActive } from '@/character.js';

// ============================================================
// Color constants (numeric for pixi.js)
// ============================================================
export const COLORS = {
  empty: 0x1a2a1a,
  ore: 0x8b4513,
  crystal: 0x6a0dad,
  charActive: 0x2196f3,
  charInactive: 0x9e9e9e,
  grid: 0x333333,
  selected: 0xffd700,
  durabilityBg: 0x333333,
  durabilityOk: 0x4caf50,
  durabilityLow: 0xf44336,
} as const;

const DEPLETED_ALPHA = 0.35;

// ============================================================
// Individual cell drawing functions (return Graphics containers)
// ============================================================

export function createEmptyCellGraphics(size: number): Graphics {
  const g = new Graphics();
  g.rect(0, 0, size, size).fill(COLORS.empty);
  g.rect(0, 0, size, size).stroke({ color: COLORS.grid, width: 0.5 });
  return g;
}

export function createResourceNodeGraphics(size: number, node: ResourceNode): Graphics {
  const color = node.type === 'OreNode' ? COLORS.ore : COLORS.crystal;
  const g = new Graphics();
  g.rect(0, 0, size, size).fill(color);
  g.rect(0, 0, size, size).stroke({ color: COLORS.grid, width: 0.5 });
  g.alpha = node.depleted ? DEPLETED_ALPHA : 1;
  return g;
}

export function createCharacterGraphics(
  size: number,
  char: Character,
  selected: boolean,
): Container {
  const container = new Container();
  const r = size * 0.35;
  const cx = size / 2;
  const cy = size / 2;

  // Diamond shape
  const diamond = new Graphics();
  diamond.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy]);
  diamond.fill(isActive(char) ? COLORS.charActive : COLORS.charInactive);

  if (selected) {
    diamond.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy]);
    diamond.stroke({ color: COLORS.selected, width: 2 });
  }
  container.addChild(diamond);

  // Durability bar
  const barW = size * 0.7;
  const barH = size * 0.08;
  const barX = (size - barW) / 2;
  const barY = size * 0.82;
  const maxDur = char.components.filter((c) => c === 'Frame').length * 100;
  const ratio = maxDur > 0 ? Math.max(0, char.durability / maxDur) : 0;

  const bar = new Graphics();
  bar.rect(barX, barY, barW, barH).fill(COLORS.durabilityBg);
  if (ratio > 0) {
    bar.rect(barX, barY, barW * ratio, barH)
      .fill(ratio > 0.3 ? COLORS.durabilityOk : COLORS.durabilityLow);
  }
  container.addChild(bar);

  return container;
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

    // Center the grid
    const totalW = cellSize * world.width;
    const totalH = cellSize * world.height;
    this.gridContainer.x = Math.floor((canvasW - totalW) / 2);
    this.gridContainer.y = Math.floor((canvasH - totalH) / 2);

    // Build lookup maps
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
