'use server';

import { api, ApiError } from '@/lib/api';

interface UserSearchResult {
  user: { name: string; email: string } | null;
}

export async function searchUserAction(email: string): Promise<{ name: string; email: string } | null> {
  try {
    const result = await api<UserSearchResult>('/search/users', { query: { email } });
    return result.user;
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}
