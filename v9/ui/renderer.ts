/**
 * Canvas 2D レンダラ。v9のWorldを2Dで描画し、パン/ズーム/クリック選択を提供する。
 * 依存を増やさないため素のCanvas 2Dを使う（v8はpixi.jsだったがv9は不要な範囲）。
 */

import { substanceByCode } from '@/sim/codes.js';
import type { ComponentObject, GroupObject, World, WorldObject } from '@/sim/types.js';
import { isWreck } from '@/sim/types.js';

export type Selection = { id: number } | null;

const BG = '#14201a';
const WRECK = '#555b55';

const CATEGORY_COLOR: Record<string, string> = {
  structure: '#8899aa',
  active: '#ef5350',
  transfer: '#26c6da',
  information: '#ffd54f',
  catalyst: '#ab47bc',
  waste: '#8d6e63',
  component: '#ffffff',
};

const COMPONENT_COLOR: Record<string, string> = {
  Assembler: '#42a5f5',
  Processor: '#ef5350',
  Storage: '#66bb6a',
  Harvester: '#26a69a',
  Sensor: '#ab47bc',
  Actuator: '#ffa726',
  Disassembler: '#c62828',
  MemoryCore: '#9e9e9e',
};

/** 個体（グループ）の「種」を構成から推定して色を決める */
const speciesColor = (members: ComponentObject[]): string => {
  const types = new Set(members.map(m => m.componentType));
  if (types.has('Disassembler')) return '#e53935'; // 捕食者
  if (types.has('Actuator')) return '#29b6f6'; // 移動種
  if (types.has('Harvester')) return '#ffa726'; // 定住種
  return '#e0e0e0';
};

interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export class Renderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private view: View = { scale: 6, offsetX: 0, offsetY: 0 };
  private world: World | null = null;
  private onSelect: (sel: Selection) => void = () => {};

  init(container: HTMLElement): void {
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'grab';
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (ctx === null) throw new Error('canvas 2d context を取得できない');
    this.ctx = ctx;
    this.resize();
    this.setupInteraction();
    window.addEventListener('resize', () => {
      this.resize();
      this.redraw();
    });
  }

  private resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resetView(worldWidth: number, worldHeight: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / worldWidth, rect.height / worldHeight) * 0.92;
    this.view = {
      scale,
      offsetX: (rect.width - worldWidth * scale) / 2,
      offsetY: (rect.height - worldHeight * scale) / 2,
    };
  }

  onSelectChanged(cb: (sel: Selection) => void): void {
    this.onSelect = cb;
  }

  private toScreen(x: number, y: number): [number, number] {
    return [x * this.view.scale + this.view.offsetX, y * this.view.scale + this.view.offsetY];
  }
  private toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.view.offsetX) / this.view.scale, (sy - this.view.offsetY) / this.view.scale];
  }

  private setupInteraction(): void {
    let dragging = false;
    let dragged = false;
    let lastX = 0;
    let lastY = 0;
    this.canvas.addEventListener('mousedown', e => {
      dragging = true;
      dragged = false;
      lastX = e.offsetX;
      lastY = e.offsetY;
      this.canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', e => {
      if (dragging && !dragged) this.handleClick(e.offsetX, e.offsetY);
      dragging = false;
      this.canvas.style.cursor = 'grab';
    });
    this.canvas.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.offsetX - lastX;
      const dy = e.offsetY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
      this.view.offsetX += dx;
      this.view.offsetY += dy;
      lastX = e.offsetX;
      lastY = e.offsetY;
      this.redraw();
    });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const [wx, wy] = this.toWorld(e.offsetX, e.offsetY);
      this.view.scale *= factor;
      // カーソル位置を中心にズーム
      this.view.offsetX = e.offsetX - wx * this.view.scale;
      this.view.offsetY = e.offsetY - wy * this.view.scale;
      this.redraw();
    }, { passive: false });
  }

  private handleClick(sx: number, sy: number): void {
    if (this.world === null) return;
    const [wx, wy] = this.toWorld(sx, sy);
    let best: WorldObject | null = null;
    let bestDist = Infinity;
    for (const obj of this.world.objects) {
      if (obj.kind === 'component' && obj.groupId !== null) continue; // グループ経由で選ぶ
      const pos = obj.kind === 'group' ? obj.position : (obj as { position: { x: number; y: number } }).position;
      const d = Math.hypot(pos.x - wx, pos.y - wy);
      if (d < bestDist) {
        bestDist = d;
        best = obj;
      }
    }
    // クリック許容半径（ワールド単位）
    if (best !== null && bestDist <= 4 / this.view.scale + 1.5) {
      this.onSelect({ id: best.id });
    } else {
      this.onSelect(null);
    }
  }

  private circle(x: number, y: number, r: number, fill: string, stroke?: string): void {
    const [sx, sy] = this.toScreen(x, y);
    const sr = Math.max(1.2, r * this.view.scale);
    this.ctx.beginPath();
    this.ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    this.ctx.fillStyle = fill;
    this.ctx.fill();
    if (stroke !== undefined) {
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = stroke;
      this.ctx.stroke();
    }
  }

  draw(world: World, selection: Selection): void {
    this.world = world;
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // 壁（ワールド境界）
    const [x0, y0] = this.toScreen(0, 0);
    const [x1, y1] = this.toScreen(world.width, world.height);
    ctx.strokeStyle = '#2c3a30';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    // 資源ノード・地面・エネルギー（背景）
    for (const obj of world.objects) {
      if (obj.kind === 'matterNode') {
        const cat = substanceByCode(obj.substanceCode)?.category ?? 'structure';
        const r = 0.5 + Math.min(1.2, Math.sqrt(obj.remaining) / 20);
        this.circle(obj.position.x, obj.position.y, r, CATEGORY_COLOR[cat] ?? '#889');
      } else if (obj.kind === 'energyNode') {
        this.circle(obj.position.x, obj.position.y, 0.7, '#ffd700');
      } else if (obj.kind === 'ground') {
        const cat = substanceByCode(obj.substanceCode)?.category ?? 'structure';
        this.circle(obj.position.x, obj.position.y, 0.3, dim(CATEGORY_COLOR[cat] ?? '#889'));
      } else if (obj.kind === 'energyPile') {
        this.circle(obj.position.x, obj.position.y, 0.3, '#8a7d00');
      }
    }

    // 個体（グループ）と単独コンポーネント（前景）
    for (const obj of world.objects) {
      if (obj.kind === 'group') {
        const members = obj.memberIds
          .map(id => world.objects.find(o => o.id === id))
          .filter((m): m is ComponentObject => m !== undefined && m.kind === 'component');
        const alive = members.filter(m => !isWreck(m));
        const color = alive.length > 0 ? speciesColor(alive) : WRECK;
        const r = 0.5 + 0.35 * Math.sqrt(obj.memberIds.length);
        const sel = selection?.id === obj.id;
        this.circle(obj.position.x, obj.position.y, r, color, sel ? '#fff' : undefined);
      } else if (obj.kind === 'component' && obj.groupId === null) {
        const color = isWreck(obj) ? WRECK : COMPONENT_COLOR[obj.componentType] ?? '#fff';
        const sel = selection?.id === obj.id;
        this.circle(obj.position.x, obj.position.y, 0.5, color, sel ? '#fff' : undefined);
      }
    }
  }

  private redraw(): void {
    if (this.world !== null) this.draw(this.world, this.currentSelection);
  }
  private currentSelection: Selection = null;
  setSelection(sel: Selection): void {
    this.currentSelection = sel;
  }
}

/** 色を暗くする（地面の散布物用） */
const dim = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 0xff) * 0.55);
  const g = Math.floor(((n >> 8) & 0xff) * 0.55);
  const b = Math.floor((n & 0xff) * 0.55);
  return `rgb(${r},${g},${b})`;
};
