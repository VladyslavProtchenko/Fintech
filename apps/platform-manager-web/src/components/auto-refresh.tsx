'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Polls the server every 3s by calling router.refresh() when platforms are deploying.
// The parent Server Component re-fetches data on each refresh.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [active, router]);

  return null;
}
