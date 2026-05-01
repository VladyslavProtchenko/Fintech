'use server';

import { api } from '@/lib/api';
import { ApiError } from '@/lib/api';

export async function searchUserAction(
  email: string,
): Promise<{ found: boolean; name?: string } | null> {
  try {
    return await api<{ found: boolean; name?: string }>(
      '/v1/recipients/check',
      { query: { email } },
    );
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthorized) return null;
    return { found: false };
  }
}
