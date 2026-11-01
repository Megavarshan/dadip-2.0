'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === 'string' ? detail : (detail as { message?: string })?.message || `HTTP ${status}`);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/backend/${path.replace(/^\//, '')}`, {
    method: init?.method || 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.location.href = `/login?next=${window.location.pathname}`;
    throw new ApiError(res.status, data?.detail ?? data);
  }
  return data as T;
}

/** Fetch on mount and every `intervalMs` (polling is the live-update mechanism of the command centre). */
export function usePoll<T>(path: string | null, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (alive.current) { setData(d); setError(null); setUpdatedAt(new Date()); }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    const first = setTimeout(load, 0); // first fetch on the next tick, then every intervalMs
    const id = setInterval(load, intervalMs);
    return () => { alive.current = false; clearTimeout(first); clearInterval(id); };
  }, [load, intervalMs]);

  return { data, error, updatedAt, reload: load };
}
