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

export async function topupAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const value = formData.get('value') as string;

  try {
    await api<TxResult>('/wallet/deposit', { method: 'POST', body: { value } });
    revalidatePath('/dashboard');
    revalidatePath('/history');
    return null;
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Something went wrong';
  }
}

export async function transferAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const toEmail = formData.get('toEmail') as string;
  const value = formData.get('value') as string;

  try {
    await api<TxResult>('/wallet/transfer', { method: 'POST', body: { toEmail, value } });
    revalidatePath('/dashboard');
    revalidatePath('/history');
    return null;
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    return 'Something went wrong';
  }
}
