import { Application, Container, Graphics } from 'pixi.js';
import type { ClientWorldState } from '../hooks/useWorldState.js';
import type {
  CharacterDTO,
  ResourceNodeDTO,
  EnergyNodeDTO,
  RemainsDTO,
  ComponentType,
  Position,
} from '@shared/types.js';

// ============================================================
// Constants
// ============================================================
const COLORS = {
  background: 0x1a2a1a,
  wall: 0x333333,
  ore: 0x8899aa,
  crystal: 0x99cc88,
  energy: 0xffd700,
  remains: 0x555555,
  selected: 0xffd700,
} as const;

const COMPONENT_COLORS: Record<ComponentType, number> = {
  Frame: 0x78909c,
  Actuator: 0x66bb6a,
  Sensor: 0xffee58,
  Processor: 0xef5350,
  Harvester: 0x8d6e63,
  Assembler: 0x42a5f5,
  Disassembler: 0x7e57c2,
  Charger: 0xffa726,
  MemoryCore: 0xab47bc,
  Register: 0x26c6da,
};

// World-space radii (matching v3 constants)
const CHARACTER_RADIUS = 0.45;
const RESOURCE_NODE_RADIUS = 0.4;
const ENERGY_NODE_RADIUS = 0.35;
const REMAINS_RADIUS = 0.3;
const FRAME_DURABILITY = 100;
const SENSE_RANGE = 10;

const LOD_THRESHOLD_PX = 8;
const MAX_ZOOM = 20;
const MIN_ZOOM = 0.1;
const ZOOM_FACTOR = 1.15;
const DRAG_THRESHOLD = 4;
const PAN_MARGIN = 0;

// ============================================================
// Selection / HitResult types
// ============================================================
export type SelectionType = 'character' | 'resourceNode' | 'energyNode' | 'remains';

export interface Selection {
  id: string;
  type: SelectionType;
}

export interface HitResult {
  id: string;
  type: SelectionType;
}

// ============================================================
// Transform
// ============================================================
interface Transform {
  baseScale: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

function effectiveScale(t: Transform): number {
  return t.baseScale * t.zoom;
}

function worldToScreen(pos: Position, t: Transform): { sx: number; sy: number } {
  const s = effectiveScale(t);
  return { sx: pos.x * s + t.offsetX, sy: pos.y * s + t.offsetY };
}

function screenToWorld(sx: number, sy: number, t: Transform): Position {
  const s = effectiveScale(t);
  return { x: (sx - t.offsetX) / s, y: (sy - t.offsetY) / s };
}

function isLOD(worldRadius: number, t: Transform): boolean {
  return worldRadius * effectiveScale(t) < LOD_THRESHOLD_PX;
}

// ============================================================
// Drawing helpers
// ============================================================
function durRatio(char: CharacterDTO): number {
  const maxDur = char.components.filter((c) => c === 'Frame').length * FRAME_DURABILITY;
  return maxDur > 0 ? Math.max(0, Math.min(1, char.durability / maxDur)) : 0;
}

function componentCounts(char: CharacterDTO): [ComponentType, number][] {
  const map = new Map<ComponentType, number>();
  for (const c of char.components) {
    map.set(c, (map.get(c) ?? 0) + 1);
  }
  return Array.from(map.entries());
}

function isActive(char: CharacterDTO): boolean {
  return char.components.includes('Processor');
}

// ============================================================
// LOD drawing
// ============================================================
function drawResourceNodeLOD(g: Graphics, node: ResourceNodeDTO, t: Transform, maxRemaining: number): void {
  const { sx, sy } = worldToScreen(node.position, t);
  const r = Math.max(2, RESOURCE_NODE_RADIUS * effectiveScale(t));
  const color = node.type === 'OreNode' ? COLORS.ore : COLORS.crystal;
  const ratio = Math.max(0.15, node.remaining / Math.max(1, maxRemaining));
  const bodySize = r * 1.6;
  const cornerR = bodySize * 0.2;
  g.roundRect(sx - bodySize / 2, sy - bodySize / 2, bodySize, bodySize, cornerR);
  g.fill({ color, alpha: ratio });
}

function drawEnergyNodeLOD(g: Graphics, node: EnergyNodeDTO, t: Transform): void {
  const { sx, sy } = worldToScreen(node.position, t);
  const r = Math.max(2, ENERGY_NODE_RADIUS * effectiveScale(t));
  const ratio = Math.max(0.1, node.stored / Math.max(1, node.maxStored));
  const s = r * 0.9;
  g.moveTo(sx, sy - s);
  g.lineTo(sx + s, sy);
  g.lineTo(sx, sy + s);
  g.lineTo(sx - s, sy);
  g.closePath();
  g.fill({ color: COLORS.energy, alpha: ratio * 0.9 });
}

function drawRemainsLOD(g: Graphics, remains: RemainsDTO, t: Transform): void {
  const { sx, sy } = worldToScreen(remains.position, t);
  const r = Math.max(1.5, REMAINS_RADIUS * effectiveScale(t));
  g.circle(sx, sy, r);
  g.fill({ color: COLORS.remains, alpha: 0.5 });
}

function drawCharacterLOD(g: Graphics, char: CharacterDTO, t: Transform, selected: boolean): void {
  const { sx, sy } = worldToScreen(char.position, t);
  const outerR = Math.max(2, CHARACTER_RADIUS * effectiveScale(t));
  const active = isActive(char);

  g.circle(sx, sy, outerR);
  g.fill({ color: active ? 0x111111 : 0x2a2a2a, alpha: 0.9 });

  const ratio = durRatio(char);
  if (ratio > 0) {
    const nucleusR = outerR * 0.7 * Math.sqrt(ratio);
    if (nucleusR > 0.5) {
      g.circle(sx, sy, nucleusR);
      g.fill({ color: active ? 0xef5350 : 0x666666, alpha: active ? 0.85 : 0.4 });
    }
  }

  if (selected) {
    g.circle(sx, sy, outerR + 2);
    g.stroke({ color: COLORS.selected, width: 1.5, alpha: 0.9 });
  }
}

// ============================================================
// Detailed drawing
// ============================================================
function drawResourceNode(g: Graphics, node: ResourceNodeDTO, t: Transform, maxRemaining: number): void {
  const { sx, sy } = worldToScreen(node.position, t);
  const r = RESOURCE_NODE_RADIUS * effectiveScale(t);
  const color = node.type === 'OreNode' ? COLORS.ore : COLORS.crystal;
  const ratio = Math.max(0.15, node.remaining / Math.max(1, maxRemaining));
  const bodySize = r * 1.6;
  const cornerR = bodySize * 0.2;
  g.roundRect(sx - bodySize / 2, sy - bodySize / 2, bodySize, bodySize, cornerR);
  g.fill({ color, alpha: ratio });
}

function drawEnergyNode(g: Graphics, node: EnergyNodeDTO, t: Transform): void {
  const { sx, sy } = worldToScreen(node.position, t);
  const r = ENERGY_NODE_RADIUS * effectiveScale(t);
  const ratio = Math.max(0.1, node.stored / Math.max(1, node.maxStored));
  const s = r * 0.9;
  g.moveTo(sx, sy - s);
  g.lineTo(sx + s, sy);
  g.lineTo(sx, sy + s);
  g.lineTo(sx - s, sy);
  g.closePath();
  g.fill({ color: COLORS.energy, alpha: ratio * 0.9 });
}

function drawRemains(g: Graphics, remains: RemainsDTO, t: Transform): void {
  const { sx, sy } = worldToScreen(remains.position, t);
  const r = REMAINS_RADIUS * effectiveScale(t);
  const totalItems = remains.components.length +
    Object.values(remains.inventory).reduce((sum, n) => sum + n, 0);
  const fillRatio = Math.min(1, totalItems / 10);
  const arcW = Math.max(1, r * 0.15);

  const startA1 = 0;
  const endA1 = Math.PI * 0.6;
  g.moveTo(sx + Math.cos(startA1) * r, sy + Math.sin(startA1) * r);
  g.arc(sx, sy, r, startA1, endA1);
  g.stroke({ color: COLORS.remains, width: arcW, alpha: 0.6 });

  const startA2 = Math.PI * 0.8;
  const endA2 = Math.PI * 1.5;
  g.moveTo(sx + Math.cos(startA2) * r, sy + Math.sin(startA2) * r);
  g.arc(sx, sy, r, startA2, endA2);
  g.stroke({ color: COLORS.remains, width: arcW, alpha: 0.4 });

  if (fillRatio > 0) {
    g.circle(sx, sy, r * 0.4 * fillRatio);
    g.fill({ color: COLORS.remains, alpha: 0.3 + fillRatio * 0.3 });
  }
}

function drawCharacter(g: Graphics, char: CharacterDTO, t: Transform, selected: boolean): void {
  const { sx, sy } = worldToScreen(char.position, t);
  const outerR = CHARACTER_RADIUS * effectiveScale(t);
  const active = isActive(char);
  const ratio = durRatio(char);
  const maxNucleusR = outerR * 0.35;
  const ringWidth = Math.max(1, outerR * 0.12);

  // Cytoplasm
  g.circle(sx, sy, outerR);
  g.fill({ color: active ? 0x1a3a4a : 0x2a2a2a, alpha: active ? 0.35 : 0.12 });

  // Component ring
  const counts = componentCounts(char);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  if (total > 0) {
    const ringR = outerR - ringWidth / 2;
    let currentAngle = -Math.PI / 2;
    for (const [type, count] of counts) {
      const arcAngle = (Math.PI * 2 * count) / total;
      const color = active ? COMPONENT_COLORS[type] : 0x666666;
      const startX = sx + Math.cos(currentAngle) * ringR;
      const startY = sy + Math.sin(currentAngle) * ringR;
      g.moveTo(startX, startY);
      g.arc(sx, sy, ringR, currentAngle, currentAngle + arcAngle);
      g.stroke({ color, width: ringWidth, alpha: active ? 0.85 : 0.35 });
      currentAngle += arcAngle;
    }
  }

  // Energy ring
  const energyRatio = Math.min(1, Math.max(0, char.energy / 5000));
  if (energyRatio > 0 && active) {
    const energyR = outerR - ringWidth - outerR * 0.04;
    const energyAngle = Math.PI * 2 * energyRatio;
    const startAngle = -Math.PI / 2;
    const eStartX = sx + Math.cos(startAngle) * energyR;
    const eStartY = sy + Math.sin(startAngle) * energyR;
    g.moveTo(eStartX, eStartY);
    g.arc(sx, sy, energyR, startAngle, startAngle + energyAngle);
    g.stroke({ color: COLORS.energy, width: Math.max(1, outerR * 0.06), alpha: 0.6 });
  }

  // Selection ring
  if (selected) {
    g.circle(sx, sy, outerR + 2);
    g.stroke({ color: COLORS.selected, width: 2, alpha: 0.9 });
  }

  // Nucleus
  const nucleusR = maxNucleusR * Math.sqrt(ratio);
  const nucleusColor = active
    ? (char.components.includes('Processor') ? COMPONENT_COLORS.Processor : 0x555555)
    : 0x555555;
  if (nucleusR > 0.5) {
    g.circle(sx, sy, nucleusR);
    g.fill({ color: nucleusColor, alpha: active ? 0.8 : 0.3 });
  }

  if (!active) {
    g.circle(sx, sy, outerR);
    g.fill({ color: 0x000000, alpha: 0.35 });
  }
}

function drawSelectionHighlight(g: Graphics, pos: Position, worldRadius: number, t: Transform): void {
  const { sx, sy } = worldToScreen(pos, t);
  const screenR = Math.max(3, worldRadius * effectiveScale(t)) + 2;
  g.circle(sx, sy, screenR);
  g.stroke({ color: COLORS.selected, width: 2, alpha: 0.9 });
}

// ============================================================
// WorldRenderer class
// ============================================================
export class WorldRenderer {
  private app: Application | null = null;
  private worldContainer = new Container();
  private transform: Transform = { baseScale: 1, zoom: 1, offsetX: 0, offsetY: 0 };
  private worldWidth = 0;
  private worldHeight = 0;
  private canvas: HTMLCanvasElement | null = null;

  // Interaction state
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragMoved = false;
  private onSelectCallback: ((hit: HitResult | null) => void) | null = null;
  private onViewChangeCallback: (() => void) | null = null;
  private getStateCallback: (() => ClientWorldState | null) | null = null;

  // Event listener refs for cleanup
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: ((e: MouseEvent) => void) | null = null;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.app = new Application();
    await this.app.init({
      canvas,
      background: COLORS.background,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: canvas.parentElement!,
    });
    this.app.ticker.stop();
    this.app.stage.addChild(this.worldContainer);
  }

  setupInteraction(
    onSelect: (hit: HitResult | null) => void,
    getState: () => ClientWorldState | null,
    onViewChange: () => void,
  ): void {
    this.onSelectCallback = onSelect;
    this.getStateCallback = getState;
    this.onViewChangeCallback = onViewChange;

    if (!this.canvas) return;
    const canvas = this.canvas;

    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    canvas.addEventListener('mousedown', this.handleMouseDown);

    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('mouseup', this.boundMouseUp);
  }

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldBefore = screenToWorld(mouseX, mouseY, this.transform);
    const zoomDir = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.transform.zoom * zoomDir));
    this.transform = { ...this.transform, zoom: newZoom };

    const s = effectiveScale(this.transform);
    this.transform = {
      ...this.transform,
      offsetX: mouseX - worldBefore.x * s,
      offsetY: mouseY - worldBefore.y * s,
    };
    this.clampOffset();
    this.onViewChangeCallback?.();
  };

  private handleMouseDown = (e: MouseEvent): void => {
    this.dragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragMoved = false;
  };

  private handleMouseMove(e: MouseEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      this.dragMoved = true;
    }
    if (this.dragMoved) {
      this.transform = {
        ...this.transform,
        offsetX: this.transform.offsetX + dx,
        offsetY: this.transform.offsetY + dy,
      };
      this.clampOffset();
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.onViewChangeCallback?.();
    }
  }

  private handleMouseUp = (e: MouseEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (!this.dragMoved && this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const state = this.getStateCallback?.();
      if (state) {
        const hit = this.hitTest(state, x, y);
        this.onSelectCallback?.(hit);
      }
    }
  };

  private clampOffset(): void {
    if (!this.canvas) return;
    const canvasW = this.canvas.clientWidth;
    const canvasH = this.canvas.clientHeight;
    const s = effectiveScale(this.transform);
    const worldScreenW = this.worldWidth * s;
    const worldScreenH = this.worldHeight * s;

    let { offsetX, offsetY } = this.transform;

    if (worldScreenW >= canvasW) {
      offsetX = Math.min(PAN_MARGIN, Math.max(canvasW - worldScreenW - PAN_MARGIN, offsetX));
    } else {
      offsetX = (canvasW - worldScreenW) / 2;
    }

    if (worldScreenH >= canvasH) {
      offsetY = Math.min(PAN_MARGIN, Math.max(canvasH - worldScreenH - PAN_MARGIN, offsetY));
    } else {
      offsetY = (canvasH - worldScreenH) / 2;
    }

    this.transform = { ...this.transform, offsetX, offsetY };
  }

  resetView(worldW: number, worldH: number): void {
    if (!this.canvas) return;
    const canvasW = this.canvas.clientWidth || 1;
    const canvasH = this.canvas.clientHeight || 1;
    const margin = 20;
    const baseScale = Math.min((canvasW - margin * 2) / worldW, (canvasH - margin * 2) / worldH);
    const offsetX = (canvasW - worldW * baseScale) / 2;
    const offsetY = (canvasH - worldH * baseScale) / 2;
    this.transform = { baseScale, zoom: 1, offsetX, offsetY };
    this.worldWidth = worldW;
    this.worldHeight = worldH;
  }

  draw(state: ClientWorldState, selection: Selection | null): void {
    if (!this.app) return;

    this.worldWidth = state.width;
    this.worldHeight = state.height;

    if (this.transform.baseScale <= 0 && state.width > 0) {
      this.resetView(state.width, state.height);
    }

    this.clampOffset();
    const t = this.transform;

    const oldChildren = this.worldContainer.removeChildren();
    for (const child of oldChildren) child.destroy();

    // Background + wall
    const bg = new Graphics();
    const { sx: bgX, sy: bgY } = worldToScreen({ x: 0, y: 0 }, t);
    const s = effectiveScale(t);
    const bgW = state.width * s;
    const bgH = state.height * s;
    bg.rect(bgX, bgY, bgW, bgH);
    bg.fill(COLORS.background);
    bg.rect(bgX, bgY, bgW, bgH);
    bg.stroke({ color: COLORS.wall, width: 2, alpha: 0.8 });
    this.worldContainer.addChild(bg);

    const maxRemaining = Math.max(50, ...Array.from(state.resourceNodes.values()).map((n) => n.remaining));
    const useLODResource = isLOD(RESOURCE_NODE_RADIUS, t);
    const useLODEnergy = isLOD(ENERGY_NODE_RADIUS, t);
    const useLODRemains = isLOD(REMAINS_RADIUS, t);
    const useLODChar = isLOD(CHARACTER_RADIUS, t);

    // Resource nodes
    const resG = new Graphics();
    for (const node of state.resourceNodes.values()) {
      const drawFn = useLODResource ? drawResourceNodeLOD : drawResourceNode;
      drawFn(resG, node, t, maxRemaining);
      if (selection?.type === 'resourceNode' && selection.id === node.id) {
        drawSelectionHighlight(resG, node.position, RESOURCE_NODE_RADIUS, t);
      }
    }
    this.worldContainer.addChild(resG);

    // Energy nodes
    const engG = new Graphics();
    for (const node of state.energyNodes.values()) {
      const drawFn = useLODEnergy ? drawEnergyNodeLOD : drawEnergyNode;
      drawFn(engG, node, t);
      if (selection?.type === 'energyNode' && selection.id === node.id) {
        drawSelectionHighlight(engG, node.position, ENERGY_NODE_RADIUS, t);
      }
    }
    this.worldContainer.addChild(engG);

    // Remains
    const remG = new Graphics();
    for (const r of state.remains.values()) {
      const drawFn = useLODRemains ? drawRemainsLOD : drawRemains;
      drawFn(remG, r, t);
      if (selection?.type === 'remains' && selection.id === r.id) {
        drawSelectionHighlight(remG, r.position, REMAINS_RADIUS, t);
      }
    }
    this.worldContainer.addChild(remG);

    // Characters
    const charG = new Graphics();
    for (const char of state.characters.values()) {
      const sel = selection?.type === 'character' && selection.id === char.id;
      const drawFn = useLODChar ? drawCharacterLOD : drawCharacter;
      drawFn(charG, char, t, sel);
    }
    this.worldContainer.addChild(charG);

    // Sense range for selected character
    if (selection?.type === 'character') {
      const selChar = state.characters.get(selection.id);
      if (selChar) {
        const rangeG = new Graphics();
        const { sx, sy } = worldToScreen(selChar.position, t);
        const screenR = SENSE_RANGE * effectiveScale(t);
        rangeG.circle(sx, sy, screenR);
        rangeG.stroke({ color: 0x888888, width: 1, alpha: 0.35 });
        this.worldContainer.addChild(rangeG);
      }
    }

    this.app.render();
  }

  hitTest(state: ClientWorldState, screenX: number, screenY: number): HitResult | null {
    const worldPos = screenToWorld(screenX, screenY, this.transform);

    // Characters first (highest priority)
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const c of state.characters.values()) {
      const dx = worldPos.x - c.position.x;
      const dy = worldPos.y - c.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= CHARACTER_RADIUS * 1.5 && d < bestDist) {
        bestDist = d;
        bestId = c.id;
      }
    }
    if (bestId) return { id: bestId, type: 'character' };

    // Resource nodes
    for (const n of state.resourceNodes.values()) {
      const dx = worldPos.x - n.position.x;
      const dy = worldPos.y - n.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= RESOURCE_NODE_RADIUS * 1.5) {
        return { id: n.id, type: 'resourceNode' };
      }
    }

    // Energy nodes
    for (const n of state.energyNodes.values()) {
      const dx = worldPos.x - n.position.x;
      const dy = worldPos.y - n.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= ENERGY_NODE_RADIUS * 1.5) {
        return { id: n.id, type: 'energyNode' };
      }
    }

    // Remains
    for (const r of state.remains.values()) {
      const dx = worldPos.x - r.position.x;
      const dy = worldPos.y - r.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= REMAINS_RADIUS * 1.5) {
        return { id: r.id, type: 'remains' };
      }
    }

    return null;
  }

  destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('wheel', this.handleWheel);
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    }
    if (this.boundMouseMove) window.removeEventListener('mousemove', this.boundMouseMove);
    if (this.boundMouseUp) window.removeEventListener('mouseup', this.boundMouseUp);
    this.app?.destroy();
    this.app = null;
    this.canvas = null;
  }
}
