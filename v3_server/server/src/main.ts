import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WorldManager } from './world-manager.js';
import { Persistence } from './persistence.js';
import { createApiRouter } from './api/router.js';
import { createAdminRouter } from './api/admin-router.js';
import { setupWebSocket } from './ws/handler.js';
import type { WorldSaveData } from './persistence.js';

// ============================================================
// Configuration
// ============================================================
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT ?? '3001', 10);
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
const CHECKPOINT_INTERVAL_MS = parseInt(
  process.env.CHECKPOINT_INTERVAL_MS ?? String(12 * 60 * 60 * 1000),
  10,
);

// ============================================================
// Initialize
// ============================================================
const worldManager = new WorldManager();
const persistence = new Persistence(DATA_DIR);

// Load persisted worlds
const worldIds = persistence.listWorlds();
for (const id of worldIds) {
  const data = persistence.loadWorld(id);
  if (data) {
    log(`Loading world: ${id} (tick=${data.world.tick})`);
    worldManager.loadWorld({
      id: data.id,
      name: data.name,
      params: data.params,
      config: data.config,
      seed: data.seed,
      world: data.world,
      totalBirths: data.totalBirths,
      totalDeaths: data.totalDeaths,
      createdAt: data.createdAt,
      ticksPerSecond: data.ticksPerSecond,
    });
    worldManager.startWorld(id);
  }
}

// ============================================================
// Public server (API + WebSocket + static files)
// ============================================================
const app = express();
app.use(express.json());
app.use('/api', createApiRouter(worldManager));

// Serve static files (built client)
// When running via tsx: import.meta.dirname = server/src
// When running compiled: import.meta.dirname = server/dist
// Client build output goes to server/dist/public
const srcDir = import.meta.dirname ?? process.cwd();
const publicDir = path.join(srcDir, '..', 'dist', 'public');
app.use(express.static(publicDir));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const server = http.createServer(app);
setupWebSocket(server, worldManager);

server.listen(PORT, () => {
  log(`Public server listening on port ${PORT}`);
});

// ============================================================
// Admin server (localhost only)
// ============================================================
const adminApp = express();
adminApp.use(express.json());
adminApp.use('/admin', createAdminRouter(worldManager, persistence, gracefulShutdown));

const adminServer = http.createServer(adminApp);
adminServer.listen(ADMIN_PORT, '127.0.0.1', () => {
  log(`Admin server listening on 127.0.0.1:${ADMIN_PORT}`);
});

// ============================================================
// Periodic checkpoint
// ============================================================
const checkpointTimer = setInterval(() => {
  saveAllWorlds('checkpoint');
}, CHECKPOINT_INTERVAL_MS);

// ============================================================
// Graceful shutdown
// ============================================================
function gracefulShutdown(): void {
  log('Graceful shutdown initiated...');
  clearInterval(checkpointTimer);
  worldManager.stopAll();
  saveAllWorlds('shutdown');

  server.close(() => {
    adminServer.close(() => {
      log('Shutdown complete');
      process.exit(0);
    });
  });

  // Force exit after timeout
  setTimeout(() => {
    log('Forced shutdown after timeout');
    process.exit(1);
  }, 25_000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ============================================================
// Helpers
// ============================================================
function saveAllWorlds(reason: string): void {
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
    log(`Saved world ${managed.id} (tick=${managed.world.tick}, reason=${reason})`);
  }
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  process.stdout.write(`[${timestamp}] ${message}\n`);
}
