import type { World, Character, ResourceNode, Position } from '@/types.js';
import { isActive } from '@/character.js';

// ============================================================
// Color constants
// ============================================================
const COLOR_EMPTY = '#1a2a1a';
const COLOR_ORE = '#8B4513';
const COLOR_CRYSTAL = '#6A0DAD';
const COLOR_CHAR_ACTIVE = '#2196F3';
const COLOR_CHAR_INACTIVE = '#9E9E9E';
const COLOR_GRID = '#333333';
const COLOR_SELECTED = '#FFD700';

const DEPLETED_ALPHA = 0.35;

// ============================================================
// Renderer
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
    const w = world.width;
    const h = world.height;

    // Build lookup maps
    const nodeMap = new Map<string, ResourceNode>();
    for (const node of world.resourceNodes) {
      nodeMap.set(posKey(node.position), node);
    }
    const charMap = new Map<string, Character>();
    for (const char of world.characters) {
      charMap.set(posKey(char.position), char);
    }

    // Draw cells
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x * cellSize;
        const py = y * cellSize;
        const key = `${x},${y}`;

        // Background
        const node = nodeMap.get(key);
        if (node) {
          ctx.globalAlpha = node.depleted ? DEPLETED_ALPHA : 1;
          ctx.fillStyle = node.type === 'OreNode' ? COLOR_ORE : COLOR_CRYSTAL;
          ctx.fillRect(px, py, cellSize, cellSize);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = COLOR_EMPTY;
          ctx.fillRect(px, py, cellSize, cellSize);
        }

        // Character
        const char = charMap.get(key);
        if (char) {
          drawCharacter(ctx, px, py, cellSize, char, char.id === selectedId);
        }

        // Grid line
        ctx.strokeStyle = COLOR_GRID;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, cellSize, cellSize);
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

// ============================================================
// Draw a character icon (diamond shape)
// ============================================================
function drawCharacter(
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

  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();

  ctx.fillStyle = isActive(char) ? COLOR_CHAR_ACTIVE : COLOR_CHAR_INACTIVE;
  ctx.fill();

  if (selected) {
    ctx.strokeStyle = COLOR_SELECTED;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Durability bar below the diamond
  const barY = py + size * 0.82;
  const barH = size * 0.08;
  const barW = size * 0.7;
  const barX = px + (size - barW) / 2;
  const maxDur = char.components.filter((c) => c === 'Frame').length * 100;
  const ratio = maxDur > 0 ? Math.max(0, char.durability / maxDur) : 0;

  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = ratio > 0.3 ? '#4CAF50' : '#F44336';
  ctx.fillRect(barX, barY, barW * ratio, barH);
}

function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}
