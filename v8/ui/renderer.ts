import { Application, Container, Graphics } from 'pixi.js';
import type {
  World,
  WorldObject,
  AssemblerObject,
  ProcessorObject,
  MaterialObject,
  EnergyObject,
  Position,
} from '@/types.js';

// ============================================================
// Colors
// ============================================================
const COLORS = {
  background: 0x1a2a1a,
  wall: 0x333333,
  assembler: 0x42a5f5,
  assemblerBusy: 0x1565c0,
  processor: 0xef5350,
  processorStopped: 0x8a3030,
  ore: 0x8899aa,
  crystal: 0x99cc88,
  metal: 0x607d8b,
  circuit: 0x4caf50,
  energy: 0xffd700,
  selected: 0xffd700,
} as const;

// ============================================================
// Sizes
// ============================================================
const COMPONENT_RADIUS = 0.4;
const MATERIAL_RADIUS = 0.2;
const MIN_ENERGY_RADIUS = 0.15;
const MAX_ENERGY_RADIUS = 0.6;

const MAX_ZOOM = 20;
const ZOOM_FACTOR = 1.15;
const DRAG_THRESHOLD = 4;

export type DrawSelection = { kind: string; id: string } | null;

type HitResult =
  | { kind: 'object'; object: WorldObject }
  | { kind: 'ground'; position: Position }
  | null;

// ============================================================
// Renderer
// ============================================================
export class Renderer {
  private app!: Application;
  private worldContainer!: Container;
  private gfx!: Graphics;
  private width = 0;
  private height = 0;

  // Pan/zoom state
  private viewX = 0;
  private viewY = 0;
  private zoom = 1;

  // Interaction state
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragMoved = false;

  async init(container: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      resizeTo: container,
      backgroundColor: COLORS.background,
      antialias: true,
    });
    container.appendChild(this.app.canvas as HTMLCanvasElement);

    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.gfx = new Graphics();
    this.worldContainer.addChild(this.gfx);
  }

  resetView(worldWidth: number, worldHeight: number): void {
    this.width = worldWidth;
    this.height = worldHeight;
    const scaleX = this.app.screen.width / worldWidth;
    const scaleY = this.app.screen.height / worldHeight;
    this.zoom = Math.min(scaleX, scaleY) * 0.95;
    this.viewX = worldWidth / 2;
    this.viewY = worldHeight / 2;
    this.applyTransform();
  }

  setupInteraction(
    onClick: (hit: HitResult) => void,
    getWorld: () => World,
    onPanZoom: () => void,
  ): void {
    const canvas = this.app.canvas as HTMLCanvasElement;

    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragMoved = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) this.dragMoved = true;
      if (this.dragMoved) {
        this.viewX -= dx / this.zoom;
        this.viewY -= dy / this.zoom;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.applyTransform();
        onPanZoom();
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      this.dragging = false;
      if (!this.dragMoved) {
        const world = getWorld();
        const worldPos = this.screenToWorld(e.clientX, e.clientY);
        const hit = this.hitTest(world, worldPos);
        onClick(hit);
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newZoom = Math.max(0.5, Math.min(MAX_ZOOM, this.zoom * factor));
      this.zoom = newZoom;
      this.applyTransform();
      onPanZoom();
    });
  }

  draw(world: World, selection: DrawSelection): void {
    const g = this.gfx;
    g.clear();

    // World border
    g.rect(0, 0, world.width, world.height).stroke({ color: COLORS.wall, width: 0.1 });

    // Draw objects
    for (const obj of world.objects) {
      const isSelected = selection?.id === obj.id;
      this.drawObject(g, obj, isSelected);
    }
  }

  private drawObject(g: Graphics, obj: WorldObject, selected: boolean): void {
    const { x, y } = obj.position;

    switch (obj.kind) {
      case 'energy': {
        const e = obj as EnergyObject;
        const r = Math.max(MIN_ENERGY_RADIUS, Math.min(MAX_ENERGY_RADIUS, Math.sqrt(e.amount / Math.PI) * 0.1));
        g.circle(x, y, r).fill({ color: COLORS.energy, alpha: 0.6 });
        break;
      }
      case 'material': {
        const m = obj as MaterialObject;
        const color = m.materialType === 'Ore' ? COLORS.ore
          : m.materialType === 'Crystal' ? COLORS.crystal
          : m.materialType === 'Metal' ? COLORS.metal
          : COLORS.circuit;
        g.circle(x, y, MATERIAL_RADIUS).fill({ color });
        break;
      }
      case 'assembler': {
        const a = obj as AssemblerObject;
        const color = a.phase === 'idle' ? COLORS.assembler : COLORS.assemblerBusy;
        g.rect(x - COMPONENT_RADIUS, y - COMPONENT_RADIUS, COMPONENT_RADIUS * 2, COMPONENT_RADIUS * 2)
          .fill({ color });
        break;
      }
      case 'processor': {
        const p = obj as ProcessorObject;
        const color = p.running ? COLORS.processor : COLORS.processorStopped;
        // Triangle for processor
        const r = COMPONENT_RADIUS;
        g.moveTo(x + r, y)
          .lineTo(x - r * 0.5, y - r * 0.87)
          .lineTo(x - r * 0.5, y + r * 0.87)
          .closePath()
          .fill({ color });
        break;
      }
    }

    if (selected) {
      g.circle(x, y, COMPONENT_RADIUS + 0.15).stroke({ color: COLORS.selected, width: 0.08 });
    }
  }

  private hitTest(world: World, pos: Position): HitResult {
    let best: WorldObject | null = null;
    let bestDist = Infinity;
    const hitRange = 0.8;

    for (const obj of world.objects) {
      const dx = obj.position.x - pos.x;
      const dy = obj.position.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < hitRange && dist < bestDist) {
        bestDist = dist;
        best = obj;
      }
    }

    if (best) return { kind: 'object', object: best };
    return { kind: 'ground', position: pos };
  }

  panToIfOffscreen(pos: Position): void {
    const screenPos = this.worldToScreen(pos.x, pos.y);
    const margin = 50;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (screenPos.x < margin || screenPos.x > w - margin ||
        screenPos.y < margin || screenPos.y > h - margin) {
      this.viewX = pos.x;
      this.viewY = pos.y;
      this.applyTransform();
    }
  }

  private applyTransform(): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.worldContainer.x = sw / 2 - this.viewX * this.zoom;
    this.worldContainer.y = sh / 2 - this.viewY * this.zoom;
    this.worldContainer.scale.set(this.zoom);
  }

  private screenToWorld(sx: number, sy: number): Position {
    const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    const cx = sx - rect.left;
    const cy = sy - rect.top;
    return {
      x: (cx - this.app.screen.width / 2) / this.zoom + this.viewX,
      y: (cy - this.app.screen.height / 2) / this.zoom + this.viewY,
    };
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.viewX) * this.zoom + this.app.screen.width / 2,
      y: (wy - this.viewY) * this.zoom + this.app.screen.height / 2,
    };
  }
}
