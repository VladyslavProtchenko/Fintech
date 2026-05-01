'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

interface TxResult {
  ok: boolean;
  transaction: {
    id: string;
    type: string;
    sum: string;
    status: string;
    counterparty: string | null;
    createdAt: string;
  };
}

export async function fundAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const sum = formData.get('sum') as string;

  try {
    await api<TxResult>('/v1/wallet/fund', { method: 'POST', body: { sum } });
    revalidatePath('/dashboard');
    revalidatePath('/history');
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Something went wrong';
  }

  redirect('/dashboard');
}

export async function wireAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const recipientEmail = formData.get('recipientEmail') as string;
  const sum = formData.get('sum') as string;

  try {
    await api<TxResult>('/v1/wallet/send', { method: 'POST', body: { recipientEmail, sum } });
    revalidatePath('/dashboard');
    revalidatePath('/history');
    return null;
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Something went wrong';
  }
}
