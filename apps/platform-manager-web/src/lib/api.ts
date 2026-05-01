import type { Platform } from './types';

const API_URL = process.env.API_URL ?? 'http://localhost:3020';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  platforms: {
    list: () => apiFetch<Platform[]>('/platforms'),
    get: (slug: string) => apiFetch<Platform>(`/platforms/${slug}`),
    status: (slug: string) =>
      apiFetch<{ status: string; siteUrl: string | null; swaggerUrl: string | null; errorMsg: string | null }>(
        `/platforms/${slug}/status`,
      ),
    create: (body: { slug: string; displayName?: string; domain?: string }) =>
      apiFetch<Platform>('/platforms', { method: 'POST', body: JSON.stringify(body) }),
    stop: (slug: string) => apiFetch<void>(`/platforms/${slug}/stop`, { method: 'PUT' }),
    start: (slug: string) => apiFetch<void>(`/platforms/${slug}/start`, { method: 'PUT' }),
    retry: (slug: string) => apiFetch<void>(`/platforms/${slug}/retry`, { method: 'POST' }),
  },
};
