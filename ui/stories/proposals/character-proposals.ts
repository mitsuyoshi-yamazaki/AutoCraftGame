/**
 * Character design proposals — drawing functions for each variant.
 *
 * Design requirements:
 * - Single-celled organism metaphor (curves, not straight lines)
 * - Components visible as organelle-like structures inside
 * - Durability expressed through the visual itself (not a separate bar)
 * - Inactive characters clearly distinguishable (grayscale / dimmed)
 */
import { Container, Graphics } from 'pixi.js';
import type { Character, ComponentType } from '@/types.js';
import { isActive } from '@/character.js';

// ============================================================
// Component → color mapping (organelle colors)
// ============================================================
const COMPONENT_COLORS: Record<ComponentType, number> = {
  Frame: 0x78909c,       // blue-gray
  Actuator: 0x66bb6a,    // green
  Sensor: 0xffee58,      // yellow
  Processor: 0xef5350,   // red
  Harvester: 0x8d6e63,   // brown
  Assembler: 0x42a5f5,   // blue
  MemoryCore: 0xab47bc,  // purple
};

const MEMBRANE_ACTIVE = 0x26c6da;   // cyan
const MEMBRANE_INACTIVE = 0x616161; // gray
const DEPLETED_ALPHA = 0.45;

// ============================================================
// Shared: compute durability ratio
// ============================================================
function durRatio(char: Character): number {
  const maxDur = char.components.filter((c) => c === 'Frame').length * 100;
  return maxDur > 0 ? Math.max(0, Math.min(1, char.durability / maxDur)) : 0;
}

// ============================================================
// Shared: deduplicate components into [type, count] pairs
// ============================================================
function componentCounts(char: Character): [ComponentType, number][] {
  const map = new Map<ComponentType, number>();
  for (const c of char.components) {
    map.set(c, (map.get(c) ?? 0) + 1);
  }
  return Array.from(map.entries());
}

// ============================================================
// Proposal A: Circle membrane + organelle dots
//
// - Outer circle = cell membrane, stroke width = durability
// - Inner small circles = one per component type, color-coded
// - Inactive: grayscale overlay
// ============================================================
export function createCharacterA(size: number, char: Character): Container {
  const c = new Container();
  const cx = size / 2;
  const cy = size / 2;
  const ratio = durRatio(char);
  const active = isActive(char);
  const membraneColor = active ? MEMBRANE_ACTIVE : MEMBRANE_INACTIVE;

  // Membrane (outer circle) — thickness encodes durability
  const maxThickness = size * 0.1;
  const minThickness = size * 0.02;
  const thickness = minThickness + (maxThickness - minThickness) * ratio;
  const outerR = size * 0.42;

  const membrane = new Graphics();
  membrane.circle(cx, cy, outerR);
  membrane.fill({ color: membraneColor, alpha: 0.15 });
  membrane.circle(cx, cy, outerR);
  membrane.stroke({ color: membraneColor, width: thickness, alpha: active ? 0.9 : 0.5 });
  c.addChild(membrane);

  // Organelles — arrange in a circle pattern inside
  const counts = componentCounts(char);
  const total = counts.length;
  const organelleR = size * 0.07;
  const orbitR = size * 0.22;

  const organelles = new Graphics();
  for (let i = 0; i < total; i++) {
    const [type, count] = counts[i];
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    const ox = cx + orbitR * Math.cos(angle);
    const oy = cy + orbitR * Math.sin(angle);
    const r = organelleR * Math.min(count, 3);
    const color = active ? COMPONENT_COLORS[type] : 0x888888;
    organelles.circle(ox, oy, r);
    organelles.fill({ color, alpha: active ? 0.85 : 0.4 });
  }
  c.addChild(organelles);

  // Nucleus (Processor indicator if present)
  if (char.components.includes('Processor')) {
    const nucleus = new Graphics();
    const nucleusR = size * 0.08;
    const color = active ? COMPONENT_COLORS.Processor : 0x666666;
    nucleus.circle(cx, cy, nucleusR);
    nucleus.fill({ color, alpha: active ? 0.9 : 0.4 });
    c.addChild(nucleus);
  }

  if (!active) c.alpha = DEPLETED_ALPHA + 0.2;

  return c;
}

// ============================================================
// Proposal B: Blob / amoeba shape + scattered dots
//
// - Irregular blob outline using bezier curves
// - Dots scattered inside for components
// - Saturation/brightness decreases with low durability
// - Inactive: desaturated + dimmed
// ============================================================
export function createCharacterB(size: number, char: Character): Container {
  const c = new Container();
  const cx = size / 2;
  const cy = size / 2;
  const ratio = durRatio(char);
  const active = isActive(char);

  // Blob outline — 8-point irregular circle with bezier
  const baseR = size * 0.38;
  const blob = new Graphics();
  const points = 8;
  const coords: { x: number; y: number }[] = [];

  for (let i = 0; i < points; i++) {
    const angle = (Math.PI * 2 * i) / points;
    // Vary radius for organic look (deterministic per index)
    const rVar = baseR * (0.85 + 0.15 * Math.sin(i * 2.7 + 1.3));
    coords.push({
      x: cx + rVar * Math.cos(angle),
      y: cy + rVar * Math.sin(angle),
    });
  }

  blob.moveTo(coords[0].x, coords[0].y);
  for (let i = 0; i < points; i++) {
    const curr = coords[i];
    const next = coords[(i + 1) % points];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    blob.quadraticCurveTo(curr.x, curr.y, midX, midY);
  }
  blob.closePath();

  // Fill alpha based on durability
  const fillAlpha = active ? (0.3 + 0.4 * ratio) : 0.2;
  const strokeAlpha = active ? (0.5 + 0.5 * ratio) : 0.3;
  const baseColor = active ? MEMBRANE_ACTIVE : MEMBRANE_INACTIVE;

  blob.fill({ color: baseColor, alpha: fillAlpha });
  blob.stroke({ color: baseColor, width: size * 0.03, alpha: strokeAlpha });
  c.addChild(blob);

  // Component dots — scattered inside
  const counts = componentCounts(char);
  const dotG = new Graphics();
  let dotIndex = 0;
  for (const [type, count] of counts) {
    for (let j = 0; j < Math.min(count, 2); j++) {
      // Deterministic position using golden angle
      const phi = 2.399963 * (dotIndex + 1);
      const dist = size * 0.12 * Math.sqrt(dotIndex + 1);
      const dx = cx + dist * Math.cos(phi);
      const dy = cy + dist * Math.sin(phi);
      const dr = size * 0.05;
      const color = active ? COMPONENT_COLORS[type] : 0x777777;
      dotG.circle(dx, dy, dr);
      dotG.fill({ color, alpha: active ? 0.8 : 0.35 });
      dotIndex++;
    }
  }
  c.addChild(dotG);

  return c;
}

// ============================================================
// Proposal C: Double circle (nucleus + cytoplasm) + ring segments
//
// - Outer ring = component segments (each colored arc)
// - Inner circle = nucleus (Processor)
// - Outer ring fills proportional to durability (missing arc = damage)
// - Inactive: grayscale + translucent
// ============================================================
export function createCharacterC(size: number, char: Character): Container {
  const c = new Container();
  const cx = size / 2;
  const cy = size / 2;
  const ratio = durRatio(char);
  const active = isActive(char);

  // Cytoplasm fill (inner area)
  const innerR = size * 0.2;
  const outerR = size * 0.4;
  const cytoColor = active ? 0x1a3a4a : 0x2a2a2a;

  const cyto = new Graphics();
  cyto.circle(cx, cy, outerR);
  cyto.fill({ color: cytoColor, alpha: active ? 0.4 : 0.2 });
  c.addChild(cyto);

  // Component ring segments — each component type gets an arc
  const counts = componentCounts(char);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  const ringWidth = size * 0.08;

  if (total > 0) {
    // Only draw arcs up to durability ratio (damage = missing arc)
    const visibleAngle = Math.PI * 2 * ratio;
    let currentAngle = -Math.PI / 2;

    const ring = new Graphics();
    for (const [type, count] of counts) {
      const arcAngle = (Math.PI * 2 * count) / total;
      const drawAngle = Math.min(arcAngle, Math.max(0, visibleAngle - (currentAngle + Math.PI / 2)));

      if (drawAngle > 0.01) {
        const color = active ? COMPONENT_COLORS[type] : 0x666666;
        const segR = outerR - ringWidth / 2;

        ring.arc(cx, cy, segR, currentAngle, currentAngle + drawAngle);
        ring.stroke({
          color,
          width: ringWidth,
          alpha: active ? 0.85 : 0.35,
        });
      }
      currentAngle += arcAngle;
    }
    c.addChild(ring);
  }

  // Nucleus (center)
  const nucleus = new Graphics();
  const nucleusColor = active
    ? (char.components.includes('Processor') ? COMPONENT_COLORS.Processor : 0x555555)
    : 0x555555;
  nucleus.circle(cx, cy, innerR);
  nucleus.fill({ color: nucleusColor, alpha: active ? 0.8 : 0.3 });
  c.addChild(nucleus);

  // MemoryCore indicator — small dot in nucleus
  if (char.components.includes('MemoryCore')) {
    const mc = new Graphics();
    mc.circle(cx, cy - innerR * 0.4, size * 0.04);
    mc.fill({ color: active ? COMPONENT_COLORS.MemoryCore : 0x777777, alpha: 0.9 });
    c.addChild(mc);
  }

  return c;
}
