'use server';

import { api, ApiError } from '@/lib/api';

interface UserResult {
  id: string;
  name: string;
  email: string;
}

export async function searchUserAction(email: string): Promise<UserResult | null> {
  try {
    return await api<UserResult>('/users/lookup', { query: { email } });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    return null;
  }
}
