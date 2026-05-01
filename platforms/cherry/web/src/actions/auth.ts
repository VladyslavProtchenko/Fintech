'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

interface AuthResponse {
  token: string;
}

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  try {
    const data = await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    const cookieStore = await cookies();
    cookieStore.set('token', data.token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7 });
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Login failed';
  }
  redirect('/dashboard');
}

export async function registerAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const name = formData.get('name') as string;

  try {
    const data = await api<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { email, password, name },
    });
    const cookieStore = await cookies();
    cookieStore.set('token', data.token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7 });
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Registration failed';
  }
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('token');
  redirect('/');
}
