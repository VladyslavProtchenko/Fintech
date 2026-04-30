'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/errors';

export async function registerAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const email = formData.get('email') as string;
  const name = formData.get('name') as string;
  const password = formData.get('password') as string;

  try {
    const { token } = await api<{ token: string }>('/auth/register', {
      method: 'POST',
      body: { email, name, password },
    });

    const cookieStore = await cookies();
    cookieStore.set('token', token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Something went wrong';
  }

  redirect('/dashboard');
}

export async function loginAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  try {
    const { token } = await api<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    const cookieStore = await cookies();
    cookieStore.set('token', token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Something went wrong';
  }

  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('token');
  redirect('/');
}
