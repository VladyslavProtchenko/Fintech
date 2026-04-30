'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/errors';

interface TxResult {
  success: boolean;
  transaction: {
    id: string;
    type: string;
    amount: string;
    status: string;
    counterparty: string | null;
    createdAt: string;
  };
}

export async function depositAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const amount = formData.get('amount') as string;

  try {
    await api<TxResult>('/account/deposit', { method: 'POST', body: { amount } });
    revalidatePath('/dashboard');
    revalidatePath('/history');
    return null;
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Something went wrong';
  }
}

export async function sendAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const recipient = formData.get('recipient') as string;
  const amount = formData.get('amount') as string;

  try {
    await api<TxResult>('/account/send', { method: 'POST', body: { recipient, amount } });
    revalidatePath('/dashboard');
    revalidatePath('/history');
    return null;
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Something went wrong';
  }
}
