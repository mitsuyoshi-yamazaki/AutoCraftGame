import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import type { WorldManager } from '../world-manager.js';
import { computeStats, worldToSnapshot } from '../world-manager.js';

export function createApiRouter(worldManager: WorldManager): Router {
  const router = createRouter();

  // GET /api/worlds
  router.get('/worlds', (_req: Request, res: Response) => {
    const worlds = worldManager.getAllWorlds().map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      tick: m.world.tick,
      characterCount: m.world.characters.length,
      createdAt: m.createdAt,
    }));
    res.json({ worlds });
  });

  // GET /api/worlds/:worldId
  router.get('/worlds/:worldId', (req: Request, res: Response) => {
    const managed = worldManager.getWorld(req.params.worldId as string);
    if (!managed) {
      res.status(404).json({ error: 'World not found' });
      return;
    }
    res.json({
      id: managed.id,
      name: managed.name,
      status: managed.status,
      tick: managed.world.tick,
      width: managed.world.width,
      height: managed.world.height,
      ticksPerSecond: managed.ticksPerSecond,
      characterCount: managed.world.characters.length,
      createdAt: managed.createdAt,
      stats: computeStats(managed),
    });
  });

  // GET /api/worlds/:worldId/state
  router.get('/worlds/:worldId/state', (req: Request, res: Response) => {
    const managed = worldManager.getWorld(req.params.worldId as string);
    if (!managed) {
      res.status(404).json({ error: 'World not found' });
      return;
    }
    res.json(worldToSnapshot(managed));
  });

  // GET /api/worlds/:worldId/characters/:characterId
  router.get('/worlds/:worldId/characters/:characterId', (req: Request, res: Response) => {
    const managed = worldManager.getWorld(req.params.worldId as string);
    if (!managed) {
      res.status(404).json({ error: 'World not found' });
      return;
    }
    const character = managed.world.characters.find((c) => c.id === req.params.characterId as string);
    if (!character) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }
    res.json(character);
  });

  return router;
}
