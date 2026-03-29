/**
 * ResourceNode design proposals — drawing functions for each variant.
 *
 * All functions return a pixi.js Container positioned at (0,0).
 * The caller is responsible for setting x/y on the returned container.
 */
import { Container, Graphics } from 'pixi.js';
import type { ResourceNode } from '@/types.js';

// ============================================================
// Color palette
// ============================================================
const ORE_PRIMARY = 0x8b4513;
const ORE_SECONDARY = 0xa0522d;
const ORE_VEIN = 0xcd853f;
const CRYSTAL_PRIMARY = 0x6a0dad;
const CRYSTAL_SECONDARY = 0x7b1fa2;
const CRYSTAL_VEIN = 0xba68c8;
const GRID_COLOR = 0x333333;
const DEPLETED_ALPHA = 0.3;

// ============================================================
// Proposal A: Rounded rect + diagonal vein lines
// Metaphor: cross-section of a mineral deposit
// ============================================================
export function createResourceNodeA(size: number, node: ResourceNode): Container {
  const c = new Container();
  const isOre = node.type === 'OreNode';
  const primary = isOre ? ORE_PRIMARY : CRYSTAL_PRIMARY;
  const vein = isOre ? ORE_VEIN : CRYSTAL_VEIN;
  const margin = size * 0.08;
  const inner = size - margin * 2;

  // Background rounded rect
  const bg = new Graphics();
  bg.roundRect(margin, margin, inner, inner, size * 0.12);
  bg.fill(primary);
  c.addChild(bg);

  // Vein pattern — diagonal lines
  const veins = new Graphics();
  const step = size * 0.18;
  for (let offset = -size; offset < size * 2; offset += step) {
    veins.moveTo(offset, margin);
    veins.lineTo(offset + inner, margin + inner);
    veins.stroke({ color: vein, width: size * 0.04, alpha: 0.5 });
  }
  // Mask to rounded rect area
  const mask = new Graphics();
  mask.roundRect(margin, margin, inner, inner, size * 0.12);
  mask.fill(0xffffff);
  c.addChild(mask);
  veins.mask = mask;
  c.addChild(veins);

  // Grid border
  const border = new Graphics();
  border.rect(0, 0, size, size).stroke({ color: GRID_COLOR, width: 0.5 });
  c.addChild(border);

  c.alpha = node.depleted ? DEPLETED_ALPHA : 1;
  return c;
}

// ============================================================
// Proposal B: Hexagonal shape + crystal dots
// Metaphor: crystalline mineral structure
// ============================================================
export function createResourceNodeB(size: number, node: ResourceNode): Container {
  const c = new Container();
  const isOre = node.type === 'OreNode';
  const primary = isOre ? ORE_PRIMARY : CRYSTAL_PRIMARY;
  const dot = isOre ? ORE_VEIN : CRYSTAL_VEIN;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;

  // Hexagon
  const hex = new Graphics();
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  hex.poly(points);
  hex.fill(primary);
  hex.poly(points);
  hex.stroke({ color: isOre ? ORE_SECONDARY : CRYSTAL_SECONDARY, width: size * 0.04 });
  c.addChild(hex);

  // Crystal dots inside
  const dots = new Graphics();
  const dotPositions = [
    [0.35, 0.3], [0.6, 0.35], [0.45, 0.55],
    [0.3, 0.65], [0.65, 0.6], [0.5, 0.4],
  ];
  for (const [dx, dy] of dotPositions) {
    const dr = size * (0.03 + Math.random() * 0.02);
    dots.circle(size * dx, size * dy, dr);
    dots.fill({ color: dot, alpha: 0.7 });
  }
  c.addChild(dots);

  // Grid border
  const border = new Graphics();
  border.rect(0, 0, size, size).stroke({ color: GRID_COLOR, width: 0.5 });
  c.addChild(border);

  c.alpha = node.depleted ? DEPLETED_ALPHA : 1;
  return c;
}

// ============================================================
// Proposal C: Cluster of small rectangles
// Metaphor: open-pit mining blocks
// ============================================================
export function createResourceNodeC(size: number, node: ResourceNode): Container {
  const c = new Container();
  const isOre = node.type === 'OreNode';
  const primary = isOre ? ORE_PRIMARY : CRYSTAL_PRIMARY;
  const secondary = isOre ? ORE_SECONDARY : CRYSTAL_SECONDARY;
  const vein = isOre ? ORE_VEIN : CRYSTAL_VEIN;

  // Block layout — irregular cluster of small rects
  const blocks: { x: number; y: number; w: number; h: number; color: number }[] = [
    { x: 0.15, y: 0.12, w: 0.35, h: 0.28, color: primary },
    { x: 0.52, y: 0.10, w: 0.30, h: 0.32, color: secondary },
    { x: 0.10, y: 0.42, w: 0.32, h: 0.30, color: secondary },
    { x: 0.44, y: 0.44, w: 0.38, h: 0.28, color: primary },
    { x: 0.20, y: 0.72, w: 0.28, h: 0.18, color: vein },
    { x: 0.52, y: 0.74, w: 0.26, h: 0.16, color: secondary },
  ];

  const g = new Graphics();
  for (const b of blocks) {
    const gap = size * 0.02;
    g.roundRect(
      size * b.x + gap, size * b.y + gap,
      size * b.w - gap * 2, size * b.h - gap * 2,
      size * 0.04,
    );
    g.fill(b.color);
  }
  c.addChild(g);

  // Grid border
  const border = new Graphics();
  border.rect(0, 0, size, size).stroke({ color: GRID_COLOR, width: 0.5 });
  c.addChild(border);

  c.alpha = node.depleted ? DEPLETED_ALPHA : 1;
  return c;
}
