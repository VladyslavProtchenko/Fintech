import { api } from '@/lib/api';
import { PlatformCard } from '@/components/platform-card';
import { AutoRefresh } from '@/components/auto-refresh';
import type { PlatformStatus } from '@/lib/types';

const PENDING: PlatformStatus[] = ['CREATING', 'BUILDING'];

export default async function PlatformsPage() {
  let platforms = await api.platforms.list().catch(() => []);

  const isDeploying = platforms.some(p => PENDING.includes(p.status));

  return (
    <>
      <AutoRefresh active={isDeploying} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Platforms</h1>
          <p className="text-sm text-gray-500 mt-0.5">{platforms.length} platform{platforms.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {platforms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-gray-500 text-sm">No platforms yet.</p>
          <a href="/platforms/new"
            className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
            Create your first platform
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map(p => (
            <PlatformCard key={p.id} platform={p} />
          ))}
        </div>
      )}
    </>
  );
}
