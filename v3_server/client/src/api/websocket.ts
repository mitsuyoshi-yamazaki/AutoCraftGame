import type { WorldSnapshot, TickDelta, ServerMessage } from '@shared/types.js';

export class WorldSocket {
  private ws: WebSocket | null = null;
  private snapshotCallback: ((snapshot: WorldSnapshot) => void) | null = null;
  private tickCallback: ((delta: TickDelta) => void) | null = null;
  private stoppedCallback: ((reason: string) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;

  connect(worldId: string): void {
    this.disconnect();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/worlds/${worldId}`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data as string);
        if (msg.type === 'snapshot' && this.snapshotCallback) {
          this.snapshotCallback(msg.data);
        } else if (msg.type === 'tick' && this.tickCallback) {
          this.tickCallback(msg.data);
        } else if (msg.type === 'world_stopped' && this.stoppedCallback) {
          this.stoppedCallback(msg.data.reason);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      if (this.disconnectCallback) this.disconnectCallback();
    };
  }

  onSnapshot(callback: (snapshot: WorldSnapshot) => void): void {
    this.snapshotCallback = callback;
  }

  onTick(callback: (delta: TickDelta) => void): void {
    this.tickCallback = callback;
  }

  onStopped(callback: (reason: string) => void): void {
    this.stoppedCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
