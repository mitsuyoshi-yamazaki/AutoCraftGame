import type { Position, World } from './types.js';

// ============================================================
// Grid entry — a positioned object with a kind tag
// ============================================================
export type GridEntryKind = 'character' | 'resourceNode' | 'energyNode' | 'remains';

export interface GridEntry {
  id: string;
  position: Position;
  kind: GridEntryKind;
}

// ============================================================
// Spatial grid — fixed-size cells for fast range queries
// ============================================================
export interface SpatialGrid {
  cellSize: number;
  cols: number;
  rows: number;
  cells: GridEntry[][];
}

// ============================================================
// Build a spatial grid from all world objects
// ============================================================
export function buildGrid(world: World, cellSize: number): SpatialGrid {
  const cols = Math.ceil(world.width / cellSize);
  const rows = Math.ceil(world.height / cellSize);
  const cells: GridEntry[][] = new Array(cols * rows);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = [];
  }

  for (const c of world.characters) {
    const idx = cellIndex(c.position, cellSize, cols, rows);
    cells[idx].push({ id: c.id, position: c.position, kind: 'character' });
  }
  for (const n of world.resourceNodes) {
    const idx = cellIndex(n.position, cellSize, cols, rows);
    cells[idx].push({ id: n.id, position: n.position, kind: 'resourceNode' });
  }
  for (const n of world.energyNodes) {
    const idx = cellIndex(n.position, cellSize, cols, rows);
    cells[idx].push({ id: n.id, position: n.position, kind: 'energyNode' });
  }
  for (const r of world.remains) {
    const idx = cellIndex(r.position, cellSize, cols, rows);
    cells[idx].push({ id: r.id, position: r.position, kind: 'remains' });
  }

  return { cellSize, cols, rows, cells };
}

// ============================================================
// Query all entries whose cells overlap a square region
// ============================================================
export function queryRange(
  grid: SpatialGrid, center: Position, range: number,
): GridEntry[] {
  const { cellSize, cols, rows, cells } = grid;

  const minCol = Math.max(0, Math.floor((center.x - range) / cellSize));
  const maxCol = Math.min(cols - 1, Math.floor((center.x + range) / cellSize));
  const minRow = Math.max(0, Math.floor((center.y - range) / cellSize));
  const maxRow = Math.min(rows - 1, Math.floor((center.y + range) / cellSize));

  const result: GridEntry[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const cell = cells[r * cols + c];
      for (let i = 0; i < cell.length; i++) {
        result.push(cell[i]);
      }
    }
  }
  return result;
}

// ============================================================
// Internal: compute cell index for a position
// ============================================================
function cellIndex(pos: Position, cellSize: number, cols: number, rows: number): number {
  const col = Math.min(cols - 1, Math.max(0, Math.floor(pos.x / cellSize)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(pos.y / cellSize)));
  return row * cols + col;
}
