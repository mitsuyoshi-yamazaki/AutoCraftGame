import type { World, Character, ResourceNode, Position } from '@/types.js';
import { isActive } from '@/character.js';

// ============================================================
// Color constants
// ============================================================
export const COLORS = {
  empty: '#1a2a1a',
  ore: '#8B4513',
  crystal: '#6A0DAD',
  charActive: '#2196F3',
  charInactive: '#9E9E9E',
  grid: '#333333',
  selected: '#FFD700',
  durabilityBg: '#333333',
  durabilityOk: '#4CAF50',
  durabilityLow: '#F44336',
} as const;

const DEPLETED_ALPHA = 0.35;

// ============================================================
// Individual cell drawing functions (used by Renderer + Stories)
// ============================================================

export function drawEmptyCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
): void {
  ctx.fillStyle = COLORS.empty;
  ctx.fillRect(px, py, size, size);
  drawGridLine(ctx, px, py, size);
}

export function drawResourceNode(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  node: ResourceNode,
): void {
  ctx.globalAlpha = node.depleted ? DEPLETED_ALPHA : 1;
  ctx.fillStyle = node.type === 'OreNode' ? COLORS.ore : COLORS.crystal;
  ctx.fillRect(px, py, size, size);
  ctx.globalAlpha = 1;
  drawGridLine(ctx, px, py, size);
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  char: Character,
  selected: boolean,
): void {
  const cx = px + size / 2;
  const cy = py + size / 2;
  const r = size * 0.35;

  // Diamond shape
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();

  ctx.fillStyle = isActive(char) ? COLORS.charActive : COLORS.charInactive;
  ctx.fill();

  if (selected) {
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Durability bar
  const barY = py + size * 0.82;
  const barH = size * 0.08;
  const barW = size * 0.7;
  const barX = px + (size - barW) / 2;
  const maxDur = char.components.filter((c) => c === 'Frame').length * 100;
  const ratio = maxDur > 0 ? Math.max(0, char.durability / maxDur) : 0;

  ctx.fillStyle = COLORS.durabilityBg;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = ratio > 0.3 ? COLORS.durabilityOk : COLORS.durabilityLow;
  ctx.fillRect(barX, barY, barW * ratio, barH);
}

function drawGridLine(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
): void {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px, py, size, size);
}

// ============================================================
// Renderer class (composes the above for the full grid)
// ============================================================
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cellSize = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(world: World): void {
    const container = this.canvas.parentElement!;
    const size = Math.min(container.clientWidth, container.clientHeight);
    const cellSize = Math.floor(size / Math.max(world.width, world.height));
    this.cellSize = cellSize;
    this.canvas.width = cellSize * world.width;
    this.canvas.height = cellSize * world.height;
  }

  draw(world: World, selectedId: string | null): void {
    const { ctx, cellSize } = this;

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
        if (node) {
          drawResourceNode(ctx, px, py, cellSize, node);
        } else {
          drawEmptyCell(ctx, px, py, cellSize);
        }

        const char = charMap.get(key);
        if (char) {
          drawCharacter(ctx, px, py, cellSize, char, char.id === selectedId);
        }
      }
    }
  }

  hitTest(world: World, canvasX: number, canvasY: number): Character | null {
    const gridX = Math.floor(canvasX / this.cellSize);
    const gridY = Math.floor(canvasY / this.cellSize);
    return world.characters.find(
      (c) => c.position.x === gridX && c.position.y === gridY,
    ) ?? null;
  }
}

function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}
