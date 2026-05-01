'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export async function depositAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const amount = formData.get('amount') as string;

  try {
    await api('/account/recharge', { method: 'POST', body: { amount } });
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Recharge failed';
  }

  revalidatePath('/dashboard');
  revalidatePath('/history');
  redirect('/dashboard');
}

export async function wireAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const recipient = formData.get('recipient') as string;
  const amount = formData.get('amount') as string;

  try {
    await api('/account/wire', { method: 'POST', body: { recipient, amount } });
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Transfer failed';
  }

  revalidatePath('/dashboard');
  revalidatePath('/history');
  return null;
}
