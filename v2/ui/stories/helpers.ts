import { Application, Container } from 'pixi.js';
import { COLORS } from '../renderer.js';

export const CELL_SIZE = 48;

export async function createStoryApp(
  width: number,
  height: number,
): Promise<{ app: Application; container: Container }> {
  const app = new Application();
  await app.init({
    width,
    height,
    background: COLORS.empty,
    antialias: false,
    resolution: 1,
  });
  const container = new Container();
  app.stage.addChild(container);
  return { app, container };
}
