import { cookies } from 'next/headers';

const BASE_URL = process.env['API_URL'] ?? 'http://localhost:3018';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
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

  let url = `${BASE_URL}${path}`;

  if (options.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    cache: 'no-store',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message = (data as { reason?: string; message?: string }).reason
      ?? (data as { message?: string }).message
      ?? res.statusText;
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}
