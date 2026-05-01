'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

export async function createPlatform(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const slug = formData.get('slug') as string;
  const displayName = (formData.get('displayName') as string) || undefined;
  const domain = (formData.get('domain') as string) || undefined;

  try {
    await api.platforms.create({ slug, displayName, domain });
  } catch (err) {
    return err instanceof Error ? err.message : 'Failed to create platform';
  }

  revalidatePath('/platforms');
  redirect('/platforms');
}

export async function stopPlatform(slug: string): Promise<void> {
  await api.platforms.stop(slug);
  revalidatePath('/platforms');
}

export async function startPlatform(slug: string): Promise<void> {
  await api.platforms.start(slug);
  revalidatePath('/platforms');
}

export async function retryPlatform(slug: string): Promise<void> {
  await api.platforms.retry(slug);
  revalidatePath('/platforms');
}
