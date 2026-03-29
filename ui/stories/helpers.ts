/**
 * Storybook helper: create a Canvas element with fixed cell size and dark background.
 */
export function createCellCanvas(cellSize: number, cols: number = 1, rows: number = 1): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = cellSize * cols;
  canvas.height = cellSize * rows;
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

export const CELL_SIZE = 48;
