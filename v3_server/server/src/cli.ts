#!/usr/bin/env node

// ============================================================
// v3-admin CLI — management commands for v3_server
// Communicates with the admin API on localhost
// ============================================================

const ADMIN_URL = `http://localhost:${process.env.ADMIN_PORT ?? '3001'}`;

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${ADMIN_URL}/admin${path}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url);
  if (method !== 'GET') {
    const res2 = await fetch(url, options);
    return res2.json();
  }
  return res.json();
}

async function post(path: string, body?: unknown): Promise<unknown> {
  const url = `${ADMIN_URL}/admin${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function del(path: string): Promise<unknown> {
  const url = `${ADMIN_URL}/admin${path}`;
  const res = await fetch(url, { method: 'DELETE' });
  return res.json();
}

async function get(path: string): Promise<unknown> {
  const url = `http://localhost:${process.env.PORT ?? '3000'}/api${path}`;
  const res = await fetch(url);
  return res.json();
}

// ============================================================
// Command handlers
// ============================================================
async function worldCreate(args: string[]): Promise<void> {
  const name = getArg(args, '--name') ?? `world-${Date.now()}`;
  const seedStr = getArg(args, '--seed');
  const tpsStr = getArg(args, '--tps');

  const body: Record<string, unknown> = { name };
  if (seedStr) body.seed = parseInt(seedStr, 10);
  if (tpsStr) body.ticksPerSecond = parseInt(tpsStr, 10);

  const result = await post('/worlds', body);
  console.log('Created:', JSON.stringify(result, null, 2));
}

async function worldList(): Promise<void> {
  const result = await get('/worlds') as { worlds: unknown[] };
  if (result.worlds.length === 0) {
    console.log('No worlds');
    return;
  }
  for (const w of result.worlds) {
    const world = w as Record<string, unknown>;
    console.log(`  ${world.id}  status=${world.status}  tick=${world.tick}  chars=${world.characterCount}`);
  }
}

async function worldStart(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) { console.error('Usage: world start <id>'); return; }
  const result = await post(`/worlds/${id}/start`);
  console.log(JSON.stringify(result));
}

async function worldStop(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) { console.error('Usage: world stop <id>'); return; }
  const result = await post(`/worlds/${id}/stop`);
  console.log(JSON.stringify(result));
}

async function worldSave(args: string[]): Promise<void> {
  if (args[0] === '--all') {
    const result = await post('/save-all');
    console.log('Saved all:', JSON.stringify(result, null, 2));
    return;
  }
  const id = args[0];
  if (!id) { console.error('Usage: world save <id> | --all'); return; }
  const result = await post(`/worlds/${id}/save`);
  console.log(JSON.stringify(result));
}

async function worldDelete(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) { console.error('Usage: world delete <id>'); return; }
  const result = await del(`/worlds/${id}`);
  console.log(JSON.stringify(result));
}

async function serverShutdown(): Promise<void> {
  const result = await post('/shutdown');
  console.log(JSON.stringify(result));
}

// ============================================================
// Argument parsing
// ============================================================
function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

// ============================================================
// Main
// ============================================================
async function main(): Promise<void> {
  const [command, subcommand, ...rest] = process.argv.slice(2);

  if (command === 'world') {
    switch (subcommand) {
      case 'create': return worldCreate(rest);
      case 'list': return worldList();
      case 'start': return worldStart(rest);
      case 'stop': return worldStop(rest);
      case 'save': return worldSave(rest);
      case 'delete': return worldDelete(rest);
      default:
        console.error('Usage: v3-admin world <create|list|start|stop|save|delete>');
    }
  } else if (command === 'server') {
    switch (subcommand) {
      case 'shutdown': return serverShutdown();
      default:
        console.error('Usage: v3-admin server <shutdown>');
    }
  } else {
    console.error('Usage: v3-admin <world|server> <subcommand>');
    console.error('Commands:');
    console.error('  world create --name <name> [--seed <n>] [--tps <n>]');
    console.error('  world list');
    console.error('  world start <id>');
    console.error('  world stop <id>');
    console.error('  world save <id> | --all');
    console.error('  world delete <id>');
    console.error('  server shutdown');
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
