'use server';

import { api } from '@/lib/api';
import { ApiError } from '@/lib/errors';

export async function searchUserAction(
  email: string,
): Promise<{ found: boolean; name?: string } | null> {
  try {
    return await api<{ found: boolean; name?: string }>(
      `/members/find?email=${encodeURIComponent(email)}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthorized) return null;
    return { found: false };
  }
}
