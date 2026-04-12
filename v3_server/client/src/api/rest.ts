import type { WorldSummary, WorldDetail } from '@shared/types.js';

export async function fetchWorlds(): Promise<WorldSummary[]> {
  const res = await fetch('/api/worlds');
  if (!res.ok) throw new Error(`Failed to fetch worlds: ${res.status}`);
  const json = await res.json();
  return json.worlds as WorldSummary[];
}

export async function fetchWorldDetail(id: string): Promise<WorldDetail> {
  const res = await fetch(`/api/worlds/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch world detail: ${res.status}`);
  return (await res.json()) as WorldDetail;
}
