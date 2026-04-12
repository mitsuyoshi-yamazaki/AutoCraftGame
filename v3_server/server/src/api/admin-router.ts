import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import type { WorldManager } from '../world-manager.js';
import type { Persistence, WorldSaveData } from '../persistence.js';
import { DEFAULT_GAME_PARAMS } from '../simulation/params.js';
import { DEFAULT_WORLD_CONFIG } from '../simulation/world.js';
import { loadProgramJson } from '../initial-characters.js';
import type { ProgramDef } from '../initial-characters.js';

export function createAdminRouter(
  worldManager: WorldManager,
  persistence: Persistence,
  shutdownFn: () => void,
): Router {
  const router = createRouter();

  // POST /admin/worlds
  router.post('/worlds', (req: Request, res: Response) => {
    const { name, params, config, seed, ticksPerSecond, programsDir } = req.body;
    const id = name ?? `world-${Date.now()}`;

    try {
      let programDefs: ProgramDef[] | undefined;
      if (programsDir) {
        programDefs = loadProgramsFromDir(programsDir);
      } else {
        // Default: load from server/programs/
        const defaultDir = path.join(import.meta.dirname ?? process.cwd(), '..', '..', 'programs');
        if (fs.existsSync(defaultDir)) {
          programDefs = loadProgramsFromDir(defaultDir);
        }
      }

      const managed = worldManager.createWorld({
        id,
        name: name ?? id,
        params: params ?? DEFAULT_GAME_PARAMS,
        config: config ?? DEFAULT_WORLD_CONFIG,
        seed: seed ?? Date.now(),
        ticksPerSecond: ticksPerSecond ?? 10,
        programDefs,
      });
      worldManager.startWorld(id);
      res.json({ id: managed.id, status: managed.status, characterCount: managed.world.characters.length });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /admin/worlds/:worldId/start
  router.post('/worlds/:worldId/start', (req: Request, res: Response) => {
    try {
      worldManager.startWorld(req.params.worldId as string);
      res.json({ status: 'started' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /admin/worlds/:worldId/stop
  router.post('/worlds/:worldId/stop', (req: Request, res: Response) => {
    try {
      worldManager.stopWorld(req.params.worldId as string);
      res.json({ status: 'stopped' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /admin/worlds/:worldId/save
  router.post('/worlds/:worldId/save', (req: Request, res: Response) => {
    const managed = worldManager.getWorld(req.params.worldId as string);
    if (!managed) {
      res.status(404).json({ error: 'World not found' });
      return;
    }

    const saveData: WorldSaveData = {
      id: managed.id,
      name: managed.name,
      params: managed.params,
      config: managed.config,
      seed: managed.seed,
      world: managed.world,
      totalBirths: managed.totalBirths,
      totalDeaths: managed.totalDeaths,
      createdAt: managed.createdAt,
      savedAt: new Date().toISOString(),
      ticksPerSecond: managed.ticksPerSecond,
    };
    persistence.saveWorld(saveData);
    res.json({ status: 'saved', tick: managed.world.tick });
  });

  // DELETE /admin/worlds/:worldId
  router.delete('/worlds/:worldId', (req: Request, res: Response) => {
    try {
      worldManager.deleteWorld(req.params.worldId as string);
      persistence.deleteWorld(req.params.worldId as string);
      res.json({ status: 'deleted' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /admin/save-all
  router.post('/save-all', (_req: Request, res: Response) => {
    const results: { id: string; tick: number }[] = [];
    for (const managed of worldManager.getAllWorlds()) {
      const saveData: WorldSaveData = {
        id: managed.id,
        name: managed.name,
        params: managed.params,
        config: managed.config,
        seed: managed.seed,
        world: managed.world,
        totalBirths: managed.totalBirths,
        totalDeaths: managed.totalDeaths,
        createdAt: managed.createdAt,
        savedAt: new Date().toISOString(),
        ticksPerSecond: managed.ticksPerSecond,
      };
      persistence.saveWorld(saveData);
      results.push({ id: managed.id, tick: managed.world.tick });
    }
    res.json({ status: 'saved', worlds: results });
  });

  // POST /admin/shutdown
  router.post('/shutdown', (_req: Request, res: Response) => {
    res.json({ status: 'shutting_down' });
    setTimeout(shutdownFn, 100);
  });

  return router;
}

function loadProgramsFromDir(dir: string): ProgramDef[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const json = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    return loadProgramJson(json);
  });
}
