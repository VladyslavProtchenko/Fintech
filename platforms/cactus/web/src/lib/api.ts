import { cookies } from 'next/headers';

const API_URL = process.env['API_URL']!;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    const msg = ApiError.extractMessage(body);
    super(msg);
    this.name = 'ApiError';
  }

  get isUnauthorized() { return this.status === 401; }

  private static extractMessage(body: unknown): string {
    if (typeof body !== 'object' || body === null) return 'Request failed';
    const b = body as { ok?: boolean; errors?: Array<{ reason?: string }> };
    if (Array.isArray(b.errors) && b.errors.length > 0) {
      return b.errors[0].reason ?? 'Request failed';
    }
    return 'Request failed';
  }
}

interface ApiOptions {
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  let url = `${API_URL}${path}`;
  if (options.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v != null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
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
