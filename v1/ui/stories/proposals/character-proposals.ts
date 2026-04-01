/**
 * Character design proposals — based on Proposal C (nucleus + ring segments).
 *
 * Shared base design:
 * - Outer ring = colored arc per component type (ALWAYS fully drawn)
 * - Inner circle = nucleus
 * - Durability expressed by a SEPARATE mechanism (not by hiding arcs)
 * - Inventory fill level shown visually
 * - Inactive: grayscale + dimmed
 *
 * Variants differ in how durability and inventory are expressed.
 */
import { Container, Graphics } from 'pixi.js';
import type { Character, ComponentType } from '@/types.js';
import { isActive } from '@/character.js';

// ============================================================
// Component → color mapping
// ============================================================
const COMPONENT_COLORS: Record<ComponentType, number> = {
  Frame: 0x78909c,
  Actuator: 0x66bb6a,
  Sensor: 0xffee58,
  Processor: 0xef5350,
  Harvester: 0x8d6e63,
  Assembler: 0x42a5f5,
  MemoryCore: 0xab47bc,
};

const INACTIVE_ALPHA = 0.55;

// ============================================================
// Shared helpers
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

function inventoryTotal(char: Character): number {
  return Object.values(char.inventory).reduce((s, n) => s + n, 0);
}

/** Max inventory estimate: enough materials to build a full character */
const INVENTORY_VISUAL_MAX = 34; // Ore x16 + Crystal x18

// ============================================================
// Shared: draw component ring (always full circle)
// ============================================================
function drawComponentRing(
  g: Graphics,
  cx: number,
  cy: number,
  segR: number,
  ringWidth: number,
  char: Character,
  active: boolean,
): void {
  const counts = componentCounts(char);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return;

  let currentAngle = -Math.PI / 2;
  for (const [type, count] of counts) {
    const arcAngle = (Math.PI * 2 * count) / total;
    const color = active ? COMPONENT_COLORS[type] : 0x666666;
    g.arc(cx, cy, segR, currentAngle, currentAngle + arcAngle);
    g.stroke({ color, width: ringWidth, alpha: active ? 0.85 : 0.35 });
    currentAngle += arcAngle;
  }
}

// ============================================================
// Proposal C1: Cytoplasm opacity = durability, nucleus fill = inventory
//
// - Component ring: always fully drawn
// - Cytoplasm (inner fill): opacity fades as durability drops
// - Nucleus center: fill level rises with inventory amount
// ============================================================
export function createCharacterC1(size: number, char: Character): Container {
  const c = new Container();
  const cx = size / 2;
  const cy = size / 2;
  const ratio = durRatio(char);
  const active = isActive(char);
  const outerR = size * 0.4;
  const innerR = size * 0.2;
  const ringWidth = size * 0.08;

  // Cytoplasm — opacity encodes durability
  const cytoAlpha = active ? (0.15 + 0.35 * ratio) : 0.12;
  const cyto = new Graphics();
  cyto.circle(cx, cy, outerR);
  cyto.fill({ color: active ? 0x1a3a4a : 0x2a2a2a, alpha: cytoAlpha });
  c.addChild(cyto);

  // Component ring (always full)
  const ring = new Graphics();
  drawComponentRing(ring, cx, cy, outerR - ringWidth / 2, ringWidth, char, active);
  c.addChild(ring);

  // Durability outline — thin arc showing remaining HP
  if (active && ratio < 1) {
    const durArc = new Graphics();
    const durAngle = Math.PI * 2 * ratio;
    durArc.arc(cx, cy, outerR + ringWidth * 0.1, -Math.PI / 2, -Math.PI / 2 + durAngle);
    durArc.stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
    c.addChild(durArc);
  }

  // Nucleus — fill level = inventory
  const invRatio = Math.min(1, inventoryTotal(char) / INVENTORY_VISUAL_MAX);
  const nucleus = new Graphics();
  const nucleusColor = active
    ? (char.components.includes('Processor') ? COMPONENT_COLORS.Processor : 0x555555)
    : 0x555555;

  // Background circle
  nucleus.circle(cx, cy, innerR);
  nucleus.fill({ color: nucleusColor, alpha: active ? 0.3 : 0.15 });

  // Filled portion (bottom-up clip via rect)
  if (invRatio > 0) {
    const fillH = innerR * 2 * invRatio;
    const fillY = cy + innerR - fillH;
    // Draw full circle then mask conceptually: use a smaller arc approach
    const fillG = new Graphics();
    fillG.circle(cx, cy, innerR);
    fillG.fill({ color: nucleusColor, alpha: active ? 0.8 : 0.3 });

    // Mask: rect covering only the filled portion
    const mask = new Graphics();
    mask.rect(cx - innerR, fillY, innerR * 2, fillH);
    mask.fill(0xffffff);
    c.addChild(mask);
    fillG.mask = mask;
    c.addChild(fillG);
  }

  c.addChild(nucleus);

  // MemoryCore dot
  if (char.components.includes('MemoryCore')) {
    const mc = new Graphics();
    mc.circle(cx, cy - innerR * 0.4, size * 0.035);
    mc.fill({ color: active ? COMPONENT_COLORS.MemoryCore : 0x777777, alpha: 0.9 });
    c.addChild(mc);
  }

  if (!active) c.alpha = INACTIVE_ALPHA;
  return c;
}

// ============================================================
// Proposal C2: Ring brightness = durability, inner dots = inventory
//
// - Component ring: always drawn, but alpha dims with low durability
// - Inventory: small dots scattered inside cytoplasm (count ~ fill)
// ============================================================
export function createCharacterC2(size: number, char: Character): Container {
  const c = new Container();
  const cx = size / 2;
  const cy = size / 2;
  const ratio = durRatio(char);
  const active = isActive(char);
  const outerR = size * 0.4;
  const innerR = size * 0.2;
  const ringWidth = size * 0.08;

  // Cytoplasm
  const cyto = new Graphics();
  cyto.circle(cx, cy, outerR);
  cyto.fill({ color: active ? 0x1a3a4a : 0x2a2a2a, alpha: active ? 0.35 : 0.12 });
  c.addChild(cyto);

  // Component ring — alpha modulated by durability
  const ring = new Graphics();
  const counts = componentCounts(char);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  if (total > 0) {
    const ringAlpha = active ? (0.35 + 0.55 * ratio) : 0.3;
    let currentAngle = -Math.PI / 2;
    for (const [type, count] of counts) {
      const arcAngle = (Math.PI * 2 * count) / total;
      const color = active ? COMPONENT_COLORS[type] : 0x666666;
      ring.arc(cx, cy, outerR - ringWidth / 2, currentAngle, currentAngle + arcAngle);
      ring.stroke({ color, width: ringWidth, alpha: ringAlpha });
      currentAngle += arcAngle;
    }
  }
  c.addChild(ring);

  // Inventory dots — scattered in the space between nucleus and ring
  const invCount = inventoryTotal(char);
  const maxDots = 12;
  const dotCount = Math.min(maxDots, Math.ceil((invCount / INVENTORY_VISUAL_MAX) * maxDots));
  if (dotCount > 0) {
    const dots = new Graphics();
    const midR = (innerR + outerR - ringWidth) / 2;
    for (let i = 0; i < dotCount; i++) {
      const angle = (Math.PI * 2 * i) / maxDots - Math.PI / 2;
      const dx = cx + midR * Math.cos(angle);
      const dy = cy + midR * Math.sin(angle);
      dots.circle(dx, dy, size * 0.025);
      dots.fill({ color: active ? 0xcccccc : 0x666666, alpha: active ? 0.6 : 0.3 });
    }
    c.addChild(dots);
  }

  // Nucleus
  const nucleus = new Graphics();
  const nucleusColor = active
    ? (char.components.includes('Processor') ? COMPONENT_COLORS.Processor : 0x555555)
    : 0x555555;
  nucleus.circle(cx, cy, innerR);
  nucleus.fill({ color: nucleusColor, alpha: active ? 0.8 : 0.3 });
  c.addChild(nucleus);

  if (char.components.includes('MemoryCore')) {
    const mc = new Graphics();
    mc.circle(cx, cy - innerR * 0.4, size * 0.035);
    mc.fill({ color: active ? COMPONENT_COLORS.MemoryCore : 0x777777, alpha: 0.9 });
    c.addChild(mc);
  }

  if (!active) c.alpha = INACTIVE_ALPHA;
  return c;
}

// ============================================================
// Proposal C3: Nucleus area = durability, inventory arc
//
// - Component ring: always full, fixed alpha
// - Durability: nucleus (center red circle) area shrinks proportionally
//   - radius = maxR * sqrt(ratio) so that area ∝ durability
// - Inventory: gray arc ring between nucleus and component ring
// ============================================================
export function createCharacterC3(size: number, char: Character): Container {
  const c = new Container();
  const cx = size / 2;
  const cy = size / 2;
  const ratio = durRatio(char);
  const active = isActive(char);
  const outerR = size * 0.4;
  const maxNucleusR = size * 0.18;
  const ringWidth = size * 0.07;

  // Cytoplasm
  const cyto = new Graphics();
  cyto.circle(cx, cy, outerR);
  cyto.fill({ color: active ? 0x1a3a4a : 0x2a2a2a, alpha: active ? 0.35 : 0.12 });
  c.addChild(cyto);

  // Component ring (always full)
  const ring = new Graphics();
  drawComponentRing(ring, cx, cy, outerR - ringWidth / 2, ringWidth, char, active);
  c.addChild(ring);

  // Inventory fill ring — arc between nucleus and component ring
  const invRatio = Math.min(1, inventoryTotal(char) / INVENTORY_VISUAL_MAX);
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
    c.addChild(inv);
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
    c.addChild(nucleus);
  }

  // MemoryCore dot — scale with nucleus but keep minimum visible size
  if (char.components.includes('MemoryCore') && nucleusR > 1) {
    const mcR = Math.max(size * 0.02, size * 0.035 * Math.sqrt(ratio));
    const mcOffset = nucleusR * 0.4;
    const mc = new Graphics();
    mc.circle(cx, cy - mcOffset, mcR);
    mc.fill({ color: active ? COMPONENT_COLORS.MemoryCore : 0x777777, alpha: 0.9 });
    c.addChild(mc);
  }

  if (!active) c.alpha = INACTIVE_ALPHA;
  return c;
}
