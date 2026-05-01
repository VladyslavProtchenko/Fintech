import { cookies } from 'next/headers';
import { ApiError } from './errors';

const API_URL = process.env['API_URL']!;

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ ok: false, errors: [{ reason: 'Request failed' }] }));
    throw new ApiError(res.status, error);
  }

  return res.json() as Promise<T>;
}
