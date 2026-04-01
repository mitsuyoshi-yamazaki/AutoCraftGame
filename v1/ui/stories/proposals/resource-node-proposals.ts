/**
 * ResourceNode design proposals — small rounded square with halo.
 *
 * Shared design:
 * - Size: ~1/3 of the cell
 * - Rounded square, solid fill, no border
 * - Bright single-tone color
 * - Halo glow when not depleted
 * - Depleted: semi-transparent body, no halo
 *
 * Variants differ in color palette and halo style.
 */
import { Container, Graphics } from 'pixi.js';
import type { ResourceNode } from '@/types.js';

const GRID_COLOR = 0x333333;
const DEPLETED_ALPHA = 0.3;

// ============================================================
// Proposal A: Warm ore / Cool crystal — soft radial halo
// ============================================================
const A_ORE = 0xd4915e;
const A_CRYSTAL = 0xa78bfa;
const A_ORE_HALO = 0xd4915e;
const A_CRYSTAL_HALO = 0xa78bfa;

export function createResourceNodeA(size: number, node: ResourceNode): Container {
  const c = new Container();
  const isOre = node.type === 'OreNode';

  drawBackground(c, size);

  if (!node.depleted) {
    drawRadialHalo(c, size, isOre ? A_ORE_HALO : A_CRYSTAL_HALO);
  }

  drawBody(c, size, isOre ? A_ORE : A_CRYSTAL, node.depleted);
  drawGrid(c, size);

  return c;
}

// ============================================================
// Proposal B: Gold ore / Cyan crystal — layered ring halo
// ============================================================
const B_ORE = 0xe8b84b;
const B_CRYSTAL = 0x67d4e2;
const B_ORE_HALO = 0xe8b84b;
const B_CRYSTAL_HALO = 0x67d4e2;

export function createResourceNodeB(size: number, node: ResourceNode): Container {
  const c = new Container();
  const isOre = node.type === 'OreNode';

  drawBackground(c, size);

  if (!node.depleted) {
    drawRingHalo(c, size, isOre ? B_ORE_HALO : B_CRYSTAL_HALO);
  }

  drawBody(c, size, isOre ? B_ORE : B_CRYSTAL, node.depleted);
  drawGrid(c, size);

  return c;
}

// ============================================================
// Proposal C: Salmon ore / Lavender crystal — square glow halo
// ============================================================
const C_ORE = 0xf0a08a;
const C_CRYSTAL = 0xc4b5fd;
const C_ORE_HALO = 0xf0a08a;
const C_CRYSTAL_HALO = 0xc4b5fd;

export function createResourceNodeC(size: number, node: ResourceNode): Container {
  const c = new Container();
  const isOre = node.type === 'OreNode';

  drawBackground(c, size);

  if (!node.depleted) {
    drawSquareHalo(c, size, isOre ? C_ORE_HALO : C_CRYSTAL_HALO);
  }

  drawBody(c, size, isOre ? C_ORE : C_CRYSTAL, node.depleted);
  drawGrid(c, size);

  return c;
}

// ============================================================
// Shared drawing helpers
// ============================================================

function drawBackground(c: Container, size: number): void {
  const bg = new Graphics();
  bg.rect(0, 0, size, size).fill(0x1a2a1a);
  c.addChild(bg);
}

function drawGrid(c: Container, size: number): void {
  const g = new Graphics();
  g.rect(0, 0, size, size).stroke({ color: GRID_COLOR, width: 0.5 });
  c.addChild(g);
}

/** Rounded-square body at center, ~1/3 of cell */
function drawBody(c: Container, size: number, color: number, depleted: boolean): void {
  const bodySize = Math.round(size / 3);
  const offset = Math.round((size - bodySize) / 2);
  const radius = bodySize * 0.2;

  const g = new Graphics();
  g.roundRect(offset, offset, bodySize, bodySize, radius).fill(color);
  g.alpha = depleted ? DEPLETED_ALPHA : 1;
  c.addChild(g);
}

/** Soft radial glow — concentric circles with decreasing alpha */
function drawRadialHalo(c: Container, size: number, color: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const g = new Graphics();
  const layers = 3;
  const bodyR = size / 6;

  for (let i = layers; i >= 1; i--) {
    const r = bodyR + bodyR * 0.4 * i;
    const alpha = 0.08 / i;
    g.circle(cx, cy, r).fill({ color, alpha });
  }
  c.addChild(g);
}

/** Layered ring glow — thin concentric ring strokes */
function drawRingHalo(c: Container, size: number, color: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const g = new Graphics();
  const bodyR = size / 6;

  const rings = [
    { r: bodyR * 1.4, alpha: 0.25, width: 1.5 },
    { r: bodyR * 1.8, alpha: 0.12, width: 1.0 },
  ];

  for (const ring of rings) {
    g.circle(cx, cy, ring.r).stroke({ color, width: ring.width, alpha: ring.alpha });
  }
  c.addChild(g);
}

/** Square glow — larger rounded rect behind the body */
function drawSquareHalo(c: Container, size: number, color: number): void {
  const g = new Graphics();
  const haloSize = Math.round(size / 2.2);
  const offset = Math.round((size - haloSize) / 2);
  const radius = haloSize * 0.22;

  g.roundRect(offset, offset, haloSize, haloSize, radius).fill({ color, alpha: 0.12 });
  c.addChild(g);
}
