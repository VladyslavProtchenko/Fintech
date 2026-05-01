'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export async function depositAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const amount = formData.get('amount') as string;

  try {
    await api('/wallet/topup', { method: 'POST', body: { amount } });
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Deposit failed';
  }

  revalidatePath('/dashboard');
  revalidatePath('/history');
  redirect('/dashboard');
}

export async function wireAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const toEmail = formData.get('toEmail') as string;
  const amount = formData.get('amount') as string;

  try {
    await api('/wallet/transfer', { method: 'POST', body: { toEmail, amount } });
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Transfer failed';
  }

  revalidatePath('/dashboard');
  revalidatePath('/history');
  return null;
}
