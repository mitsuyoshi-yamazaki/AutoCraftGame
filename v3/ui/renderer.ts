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
import { FRAME_DURABILITY, CHARACTER_RADIUS, RESOURCE_NODE_RADIUS, ENERGY_NODE_RADIUS, REMAINS_RADIUS } from '@/constants.js';

// ============================================================
// Color constants
// ============================================================
export const COLORS = {
  background: 0x1a2a1a,
  wall: 0x333333,
  ore: 0xe8b84b,
  crystal: 0x67d4e2,
  energy: 0xffd700,
  remains: 0x555555,
  selected: 0xffd700,
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
// HitResult — what was clicked
// ============================================================
export type HitResult =
  | { kind: 'character'; character: Character }
  | { kind: 'resourceNode'; resourceNode: ResourceNode }
  | { kind: 'energyNode'; energyNode: EnergyNode }
  | { kind: 'remains'; remains: Remains };

// ============================================================
// Coordinate transform helpers
// ============================================================
interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function computeTransform(canvasW: number, canvasH: number, worldW: number, worldH: number): Transform {
  const margin = 20;
  const availW = canvasW - margin * 2;
  const availH = canvasH - margin * 2;
  const scale = Math.min(availW / worldW, availH / worldH);
  const offsetX = (canvasW - worldW * scale) / 2;
  const offsetY = (canvasH - worldH * scale) / 2;
  return { scale, offsetX, offsetY };
}

function worldToScreen(pos: Position, t: Transform): { sx: number; sy: number } {
  return { sx: pos.x * t.scale + t.offsetX, sy: pos.y * t.scale + t.offsetY };
}

function screenToWorld(sx: number, sy: number, t: Transform): Position {
  return { x: (sx - t.offsetX) / t.scale, y: (sy - t.offsetY) / t.scale };
}

// ============================================================
// Drawing functions — each returns a new Graphics to avoid path leaking
// ============================================================

function drawResourceNode(node: ResourceNode, t: Transform, maxRemaining: number): Graphics {
  const g = new Graphics();
  const { sx, sy } = worldToScreen(node.position, t);
  const r = RESOURCE_NODE_RADIUS * t.scale;
  const isOre = node.type === 'OreNode';
  const color = isOre ? COLORS.ore : COLORS.crystal;
  const ratio = Math.max(0.15, node.remaining / Math.max(1, maxRemaining));

  const bodySize = r * 1.6;
  const cornerR = bodySize * 0.2;
  g.roundRect(sx - bodySize / 2, sy - bodySize / 2, bodySize, bodySize, cornerR);
  g.fill({ color, alpha: ratio });
  return g;
}

function drawEnergyNode(node: EnergyNode, t: Transform): Graphics {
  const g = new Graphics();
  const { sx, sy } = worldToScreen(node.position, t);
  const r = ENERGY_NODE_RADIUS * t.scale;
  const ratio = Math.max(0.1, node.stored / Math.max(1, node.maxStored));

  const s = r * 0.9;
  g.moveTo(sx, sy - s);
  g.lineTo(sx + s, sy);
  g.lineTo(sx, sy + s);
  g.lineTo(sx - s, sy);
  g.closePath();
  g.fill({ color: COLORS.energy, alpha: ratio * 0.9 });
  return g;
}

function drawRemains(remains: Remains, t: Transform): Graphics {
  const g = new Graphics();
  const { sx, sy } = worldToScreen(remains.position, t);
  const r = REMAINS_RADIUS * t.scale;

  const totalItems = remains.components.length +
    Object.values(remains.inventory).reduce((sum, n) => sum + n, 0);
  const fillRatio = Math.min(1, totalItems / 10);

  const arcW = Math.max(1, r * 0.15);
  // Arc fragment 1
  const startA1 = 0;
  const endA1 = Math.PI * 0.6;
  g.moveTo(sx + Math.cos(startA1) * r, sy + Math.sin(startA1) * r);
  g.arc(sx, sy, r, startA1, endA1);
  g.stroke({ color: COLORS.remains, width: arcW, alpha: 0.6 });

  // Arc fragment 2
  const startA2 = Math.PI * 0.8;
  const endA2 = Math.PI * 1.5;
  g.moveTo(sx + Math.cos(startA2) * r, sy + Math.sin(startA2) * r);
  g.arc(sx, sy, r, startA2, endA2);
  g.stroke({ color: COLORS.remains, width: arcW, alpha: 0.4 });

  if (fillRatio > 0) {
    g.circle(sx, sy, r * 0.4 * fillRatio);
    g.fill({ color: COLORS.remains, alpha: 0.3 + fillRatio * 0.3 });
  }
  return g;
}

function drawCharacter(char: Character, t: Transform, selected: boolean): Graphics {
  const g = new Graphics();
  const { sx, sy } = worldToScreen(char.position, t);
  const outerR = CHARACTER_RADIUS * t.scale;
  const active = isActive(char);
  const ratio = durRatio(char);
  const maxNucleusR = outerR * 0.35;
  const ringWidth = Math.max(1, outerR * 0.12);

  // Cytoplasm
  g.circle(sx, sy, outerR);
  g.fill({ color: active ? 0x1a3a4a : 0x2a2a2a, alpha: active ? 0.35 : 0.12 });

  // Component ring — each arc segment needs moveTo to avoid path connection
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
    g.fill({ color: 0x000000, alpha: 1 - INACTIVE_ALPHA });
  }

  return g;
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
// Renderer class
// ============================================================
export class Renderer {
  readonly app: Application;
  private worldContainer = new Container();
  private transform: Transform = { scale: 1, offsetX: 0, offsetY: 0 };

  constructor() {
    this.app = new Application();
  }

  async init(container: HTMLElement): Promise<void> {
    await this.app.init({
      background: COLORS.background,
      resizeTo: container,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    container.appendChild(this.app.canvas);
    this.app.stage.addChild(this.worldContainer);
  }

  draw(world: World, selectedId: string | null): void {
    const canvasW = this.app.canvas.clientWidth;
    const canvasH = this.app.canvas.clientHeight;
    this.transform = computeTransform(canvasW, canvasH, world.width, world.height);

    this.worldContainer.removeChildren();

    // Background + wall border
    const bg = new Graphics();
    const { sx: bgX, sy: bgY } = worldToScreen({ x: 0, y: 0 }, this.transform);
    const bgW = world.width * this.transform.scale;
    const bgH = world.height * this.transform.scale;
    bg.rect(bgX, bgY, bgW, bgH);
    bg.fill(COLORS.background);
    bg.rect(bgX, bgY, bgW, bgH);
    bg.stroke({ color: COLORS.wall, width: 2, alpha: 0.8 });
    this.worldContainer.addChild(bg);

    const maxRemaining = world.resourceNodes.reduce((m, n) => Math.max(m, n.remaining), 50);

    for (const node of world.resourceNodes) {
      this.worldContainer.addChild(drawResourceNode(node, this.transform, maxRemaining));
    }

    for (const node of world.energyNodes) {
      this.worldContainer.addChild(drawEnergyNode(node, this.transform));
    }

    for (const r of world.remains) {
      this.worldContainer.addChild(drawRemains(r, this.transform));
    }

    for (const char of world.characters) {
      this.worldContainer.addChild(drawCharacter(char, this.transform, char.id === selectedId));
    }
  }

  hitTest(world: World, globalX: number, globalY: number): HitResult | null {
    const worldPos = screenToWorld(globalX, globalY, this.transform);

    let bestChar: Character | null = null;
    let bestCharDist = Infinity;
    for (const c of world.characters) {
      const dx = worldPos.x - c.position.x;
      const dy = worldPos.y - c.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= CHARACTER_RADIUS * 1.5 && d < bestCharDist) {
        bestCharDist = d;
        bestChar = c;
      }
    }
    if (bestChar) return { kind: 'character', character: bestChar };

    for (const n of world.resourceNodes) {
      const dx = worldPos.x - n.position.x;
      const dy = worldPos.y - n.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= RESOURCE_NODE_RADIUS * 1.5) {
        return { kind: 'resourceNode', resourceNode: n };
      }
    }

    for (const n of world.energyNodes) {
      const dx = worldPos.x - n.position.x;
      const dy = worldPos.y - n.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= ENERGY_NODE_RADIUS * 1.5) {
        return { kind: 'energyNode', energyNode: n };
      }
    }

    for (const r of world.remains) {
      const dx = worldPos.x - r.position.x;
      const dy = worldPos.y - r.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= REMAINS_RADIUS * 1.5) {
        return { kind: 'remains', remains: r };
      }
    }

    return null;
  }
}
