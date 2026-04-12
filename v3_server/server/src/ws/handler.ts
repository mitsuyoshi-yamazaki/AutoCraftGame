import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import type { WorldManager } from '../world-manager.js';
import { worldToSnapshot } from '../world-manager.js';
import type { TickDelta, ServerMessage } from '../../../shared/types.js';

export function setupWebSocket(server: Server, worldManager: WorldManager): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);
    const match = url.pathname.match(/^\/ws\/worlds\/(.+)$/);

    if (!match) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, match[1]);
    });
  });

  wss.on('connection', (ws: WebSocket, _request: IncomingMessage, worldId: string) => {
    const managed = worldManager.getWorld(worldId);
    if (!managed) {
      sendMessage(ws, { type: 'world_stopped', data: { reason: 'not_found' } });
      ws.close();
      return;
    }

    // Send initial snapshot
    const snapshot = worldToSnapshot(managed);
    sendMessage(ws, { type: 'snapshot', data: snapshot });

    // Register tick listener
    const listener = (delta: TickDelta) => {
      if (ws.readyState === ws.OPEN) {
        sendMessage(ws, { type: 'tick', data: delta });
      }
    };

    worldManager.addTickListener(worldId, listener);

    ws.on('close', () => {
      worldManager.removeTickListener(worldId, listener);
    });

    ws.on('error', () => {
      worldManager.removeTickListener(worldId, listener);
    });
  });

  return wss;
}

function sendMessage(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}
