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
// Drawing functions
// ============================================================

function drawResourceNode(g: Graphics, node: ResourceNode, t: Transform, maxRemaining: number): void {
  const { sx, sy } = worldToScreen(node.position, t);
  const r = RESOURCE_NODE_RADIUS * t.scale;
  const isOre = node.type === 'OreNode';
  const color = isOre ? COLORS.ore : COLORS.crystal;
  const ratio = Math.max(0.15, node.remaining / Math.max(1, maxRemaining));

  // Body — rounded square
  const bodySize = r * 1.6;
  const cornerR = bodySize * 0.2;
  g.roundRect(sx - bodySize / 2, sy - bodySize / 2, bodySize, bodySize, cornerR);
  g.fill({ color, alpha: ratio });
}

function drawEnergyNode(g: Graphics, node: EnergyNode, t: Transform): void {
  const { sx, sy } = worldToScreen(node.position, t);
  const r = ENERGY_NODE_RADIUS * t.scale;
  const ratio = Math.max(0.1, node.stored / Math.max(1, node.maxStored));

  // Diamond shape
  const s = r * 0.9;
  g.moveTo(sx, sy - s);
  g.lineTo(sx + s, sy);
  g.lineTo(sx, sy + s);
  g.lineTo(sx - s, sy);
  g.closePath();
  g.fill({ color: COLORS.energy, alpha: ratio * 0.9 });
}

function drawRemains(g: Graphics, remains: Remains, t: Transform): void {
  const { sx, sy } = worldToScreen(remains.position, t);
  const r = REMAINS_RADIUS * t.scale;

  const totalItems = remains.components.length +
    Object.values(remains.inventory).reduce((s, n) => s + n, 0);
  const fillRatio = Math.min(1, totalItems / 10);

  // Broken arc fragments
  g.arc(sx, sy, r, 0, Math.PI * 0.6);
  g.stroke({ color: COLORS.remains, width: Math.max(1, r * 0.15), alpha: 0.6 });
  g.arc(sx, sy, r, Math.PI * 0.8, Math.PI * 1.5);
  g.stroke({ color: COLORS.remains, width: Math.max(1, r * 0.15), alpha: 0.4 });

  // Inner fill
  if (fillRatio > 0) {
    g.circle(sx, sy, r * 0.4 * fillRatio);
    g.fill({ color: COLORS.remains, alpha: 0.3 + fillRatio * 0.3 });
  }
}

function drawCharacter(g: Graphics, char: Character, t: Transform, selected: boolean): void {
  const { sx, sy } = worldToScreen(char.position, t);
  const outerR = CHARACTER_RADIUS * t.scale;
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
    let currentAngle = -Math.PI / 2;
    for (const [type, count] of counts) {
      const arcAngle = (Math.PI * 2 * count) / total;
      const color = active ? COMPONENT_COLORS[type] : 0x666666;
      g.arc(sx, sy, outerR - ringWidth / 2, currentAngle, currentAngle + arcAngle);
      g.stroke({ color, width: ringWidth, alpha: active ? 0.85 : 0.35 });
      currentAngle += arcAngle;
    }
  }

  // Energy ring (inner, thin)
  const energyRatio = Math.min(1, Math.max(0, char.energy / 5000));
  if (energyRatio > 0 && active) {
    const energyR = outerR - ringWidth - outerR * 0.04;
    const energyAngle = Math.PI * 2 * energyRatio;
    g.arc(sx, sy, energyR, -Math.PI / 2, -Math.PI / 2 + energyAngle);
    g.stroke({ color: COLORS.energy, width: Math.max(1, outerR * 0.06), alpha: 0.6 });
  }

  // Selection ring
  if (selected) {
    g.circle(sx, sy, outerR + 2);
    g.stroke({ color: COLORS.selected, width: 2, alpha: 0.9 });
  }

  // Nucleus — area proportional to durability
  const nucleusR = maxNucleusR * Math.sqrt(ratio);
  const nucleusColor = active
    ? (char.components.includes('Processor') ? COMPONENT_COLORS.Processor : 0x555555)
    : 0x555555;

  if (nucleusR > 0.5) {
    g.circle(sx, sy, nucleusR);
    g.fill({ color: nucleusColor, alpha: active ? 0.8 : 0.3 });
  }

  if (!active) {
    // Dim overlay
    g.circle(sx, sy, outerR);
    g.fill({ color: 0x000000, alpha: 1 - INACTIVE_ALPHA });
  }
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

    const g = new Graphics();

    // Background
    const { sx: bgX, sy: bgY } = worldToScreen({ x: 0, y: 0 }, this.transform);
    const bgW = world.width * this.transform.scale;
    const bgH = world.height * this.transform.scale;
    g.rect(bgX, bgY, bgW, bgH);
    g.fill(COLORS.background);

    // Wall border
    g.rect(bgX, bgY, bgW, bgH);
    g.stroke({ color: COLORS.wall, width: 2, alpha: 0.8 });

    // Determine max remaining for scaling
    const maxRemaining = world.resourceNodes.reduce((m, n) => Math.max(m, n.remaining), 50);

    // ResourceNodes
    for (const node of world.resourceNodes) {
      drawResourceNode(g, node, this.transform, maxRemaining);
    }

    // EnergyNodes
    for (const node of world.energyNodes) {
      drawEnergyNode(g, node, this.transform);
    }

    // Remains
    for (const r of world.remains) {
      drawRemains(g, r, this.transform);
    }

    // Characters
    for (const char of world.characters) {
      drawCharacter(g, char, this.transform, char.id === selectedId);
    }

    this.worldContainer.addChild(g);
  }

  hitTest(world: World, globalX: number, globalY: number): HitResult | null {
    const worldPos = screenToWorld(globalX, globalY, this.transform);

    // Characters first (priority)
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

    // ResourceNodes
    for (const n of world.resourceNodes) {
      const dx = worldPos.x - n.position.x;
      const dy = worldPos.y - n.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= RESOURCE_NODE_RADIUS * 1.5) {
        return { kind: 'resourceNode', resourceNode: n };
      }
    }

    // EnergyNodes
    for (const n of world.energyNodes) {
      const dx = worldPos.x - n.position.x;
      const dy = worldPos.y - n.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= ENERGY_NODE_RADIUS * 1.5) {
        return { kind: 'energyNode', energyNode: n };
      }
    }

    // Remains
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
