import { Application, Container, Graphics } from 'pixi.js';
import type {
  World,
  Character,
  ResourceNode,
  EnergyNode,
  Remains,
  Position,
  ComponentType,
} from '@/types.js';
import { isActive } from '@/character.js';
import { FRAME_DURABILITY } from '@/constants.js';

// ============================================================
// Color constants
// ============================================================
export const COLORS = {
  empty: 0x1a2a1a,
  grid: 0x333333,
  ore: 0xe8b84b,
  crystal: 0x67d4e2,
  energy: 0xffd700,
  remains: 0x555555,
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
  Disassembler: 0x7e57c2,
  Charger: 0xffa726,
  MemoryCore: 0xab47bc,
};

const INACTIVE_ALPHA = 0.65;

// ============================================================
// Empty cell
// ============================================================
export function createEmptyCellGraphics(size: number): Graphics {
  const g = new Graphics();
  g.rect(0, 0, size, size).fill(COLORS.empty);
  g.rect(0, 0, size, size).stroke({ color: COLORS.grid, width: 1, alpha: 0.55 });
  return g;
}

// ============================================================
// ResourceNode — remaining ratio controls alpha
// ============================================================
export function createResourceNodeGraphics(
  size: number,
  node: ResourceNode,
  maxRemaining: number = 50,
): Container {
  const c = new Container();
  const isOre = node.type === 'OreNode';
  const color = isOre ? COLORS.ore : COLORS.crystal;
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  const ratio = Math.max(0.15, node.remaining / Math.max(1, maxRemaining));

  const bg = new Graphics();
  bg.rect(0, 0, size, size).fill(COLORS.empty);
  c.addChild(bg);

  // Halo rings — intensity scales with remaining
  const bodyR = size / 6;
  const halo = new Graphics();
  halo.circle(cx, cy, bodyR * 1.4).stroke({ color, width: 1.5, alpha: 0.25 * ratio });
  halo.circle(cx, cy, bodyR * 1.8).stroke({ color, width: 1.0, alpha: 0.12 * ratio });
  c.addChild(halo);

  // Body — rounded square
  const bodySize = Math.round(size / 3);
  const offset = Math.floor((size - bodySize) / 2);
  const radius = bodySize * 0.2;
  const body = new Graphics();
  body.roundRect(offset, offset, bodySize, bodySize, radius).fill(color);
  body.alpha = ratio;
  c.addChild(body);

  // Grid line
  const grid = new Graphics();
  grid.rect(0, 0, size, size).stroke({ color: COLORS.grid, width: 1, alpha: 0.55 });
  c.addChild(grid);

  return c;
}

// ============================================================
// EnergyNode — golden glow, stored ratio controls intensity
// ============================================================
export function createEnergyNodeGraphics(
  size: number,
  node: EnergyNode,
): Container {
  const c = new Container();
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  const ratio = Math.max(0.1, node.stored / Math.max(1, node.maxStored));

  const bg = new Graphics();
  bg.rect(0, 0, size, size).fill(COLORS.empty);
  c.addChild(bg);

  // Glow rings
  const glowR = size * 0.3;
  const glow = new Graphics();
  glow.circle(cx, cy, glowR * 1.5).stroke({ color: COLORS.energy, width: 1.5, alpha: 0.15 * ratio });
  glow.circle(cx, cy, glowR * 2.0).stroke({ color: COLORS.energy, width: 1.0, alpha: 0.08 * ratio });
  c.addChild(glow);

  // Core — diamond shape
  const s = Math.round(size / 4);
  const diamond = new Graphics();
  diamond.moveTo(cx, cy - s);
  diamond.lineTo(cx + s, cy);
  diamond.lineTo(cx, cy + s);
  diamond.lineTo(cx - s, cy);
  diamond.closePath();
  diamond.fill({ color: COLORS.energy, alpha: ratio * 0.9 });
  c.addChild(diamond);

  // Grid line
  const grid = new Graphics();
  grid.rect(0, 0, size, size).stroke({ color: COLORS.grid, width: 1, alpha: 0.55 });
  c.addChild(grid);

  return c;
}

// ============================================================
// Remains — broken circle with gray tone
// ============================================================
export function createRemainsGraphics(
  size: number,
  remains: Remains,
): Container {
  const c = new Container();
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);

  const bg = new Graphics();
  bg.rect(0, 0, size, size).fill(COLORS.empty);
  c.addChild(bg);

  const totalItems = remains.components.length +
    Object.values(remains.inventory).reduce((s, n) => s + n, 0);
  const fillRatio = Math.min(1, totalItems / 10);

  // Broken arc fragments
  const r = size * 0.3;
  const body = new Graphics();
  body.arc(cx, cy, r, 0, Math.PI * 0.6).stroke({ color: COLORS.remains, width: size * 0.06, alpha: 0.6 });
  body.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 1.5).stroke({ color: COLORS.remains, width: size * 0.06, alpha: 0.4 });
  c.addChild(body);

  // Inner fill representing remaining content
  if (fillRatio > 0) {
    const inner = new Graphics();
    inner.circle(cx, cy, r * 0.4 * fillRatio);
    inner.fill({ color: COLORS.remains, alpha: 0.3 + fillRatio * 0.3 });
    c.addChild(inner);
  }

  // Grid line
  const grid = new Graphics();
  grid.rect(0, 0, size, size).stroke({ color: COLORS.grid, width: 1, alpha: 0.55 });
  c.addChild(grid);

  return c;
}

// ============================================================
// Character — nucleus + component ring + energy ring + inventory arc
// ============================================================
const INVENTORY_VISUAL_MAX = 40;

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
  const maxNucleusR = size * 0.15;
  const ringWidth = size * 0.06;

  // Cytoplasm
  const cyto = new Graphics();
  cyto.circle(cx, cy, outerR);
  cyto.fill({ color: active ? 0x1a3a4a : 0x2a2a2a, alpha: active ? 0.35 : 0.12 });
  container.addChild(cyto);

  // Component ring
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

  // Energy ring (inner, thin)
  const energyRatio = Math.min(1, Math.max(0, char.energy / 5000));
  if (energyRatio > 0 && active) {
    const energyR = outerR - ringWidth - size * 0.02;
    const energyAngle = Math.PI * 2 * energyRatio;
    const eRing = new Graphics();
    eRing.arc(cx, cy, energyR, -Math.PI / 2, -Math.PI / 2 + energyAngle);
    eRing.stroke({ color: COLORS.energy, width: size * 0.03, alpha: 0.6 });
    container.addChild(eRing);
  }

  // Selection ring
  if (selected) {
    const sel = new Graphics();
    sel.circle(cx, cy, outerR + 2).stroke({ color: COLORS.selected, width: 2, alpha: 0.9 });
    container.addChild(sel);
  }

  // Inventory arc
  const invTotal = Object.values(char.inventory).reduce((s, n) => s + n, 0);
  const invRatio = Math.min(1, invTotal / INVENTORY_VISUAL_MAX);
  if (invRatio > 0) {
    const invR = (maxNucleusR + outerR - ringWidth * 2) / 2;
    const invAngle = Math.PI * 2 * invRatio;
    const inv = new Graphics();
    inv.arc(cx, cy, invR, -Math.PI / 2, -Math.PI / 2 + invAngle);
    inv.stroke({ color: active ? 0xaaaaaa : 0x555555, width: size * 0.03, alpha: active ? 0.4 : 0.2 });
    container.addChild(inv);
  }

  // Nucleus — area proportional to durability
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
  const maxDur = char.components.filter((c) => c === 'Frame').length * FRAME_DURABILITY;
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
// HitResult — what was clicked
// ============================================================
export type HitResult =
  | { kind: 'character'; character: Character }
  | { kind: 'resourceNode'; resourceNode: ResourceNode }
  | { kind: 'energyNode'; energyNode: EnergyNode }
  | { kind: 'remains'; remains: Remains };

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
    const cellSize = Math.floor(
      Math.min(canvasW, canvasH) / Math.max(world.width, world.height),
    );
    this.cellSize = cellSize;

    this.gridContainer.removeChildren();

    const totalW = cellSize * world.width;
    const totalH = cellSize * world.height;
    this.gridContainer.x = Math.floor((canvasW - totalW) / 2);
    this.gridContainer.y = Math.floor((canvasH - totalH) / 2);

    // Build lookup maps
    const nodeMap = new Map<string, ResourceNode>();
    for (const node of world.resourceNodes) nodeMap.set(posKey(node.position), node);
    const energyMap = new Map<string, EnergyNode>();
    for (const node of world.energyNodes) energyMap.set(posKey(node.position), node);
    const remainsMap = new Map<string, Remains>();
    for (const r of world.remains) remainsMap.set(posKey(r.position), r);
    const charMap = new Map<string, Character>();
    for (const char of world.characters) charMap.set(posKey(char.position), char);

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const px = x * cellSize;
        const py = y * cellSize;
        const key = `${x},${y}`;

        const rNode = nodeMap.get(key);
        const eNode = energyMap.get(key);
        const rem = remainsMap.get(key);
        const char = charMap.get(key);

        let cellGraphics: Container | Graphics;
        if (rNode) {
          cellGraphics = createResourceNodeGraphics(cellSize, rNode);
        } else if (eNode) {
          cellGraphics = createEnergyNodeGraphics(cellSize, eNode);
        } else if (rem) {
          cellGraphics = createRemainsGraphics(cellSize, rem);
        } else {
          cellGraphics = createEmptyCellGraphics(cellSize);
        }
        cellGraphics.x = px;
        cellGraphics.y = py;
        this.gridContainer.addChild(cellGraphics);

        if (char) {
          const charGraphics = createCharacterGraphics(cellSize, char, char.id === selectedId);
          charGraphics.x = px;
          charGraphics.y = py;
          this.gridContainer.addChild(charGraphics);
        }
      }
    }
  }

  hitTest(world: World, globalX: number, globalY: number): HitResult | null {
    const localX = globalX - this.gridContainer.x;
    const localY = globalY - this.gridContainer.y;
    const gridX = Math.floor(localX / this.cellSize);
    const gridY = Math.floor(localY / this.cellSize);

    const char = world.characters.find((c) => c.position.x === gridX && c.position.y === gridY);
    if (char) return { kind: 'character', character: char };

    const rn = world.resourceNodes.find((n) => n.position.x === gridX && n.position.y === gridY);
    if (rn) return { kind: 'resourceNode', resourceNode: rn };

    const en = world.energyNodes.find((n) => n.position.x === gridX && n.position.y === gridY);
    if (en) return { kind: 'energyNode', energyNode: en };

    const rem = world.remains.find((r) => r.position.x === gridX && r.position.y === gridY);
    if (rem) return { kind: 'remains', remains: rem };

    return null;
  }
}

function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}
