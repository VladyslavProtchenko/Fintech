import { stopPlatform, startPlatform, retryPlatform } from '@/actions/platforms';
import { StatusBadge } from './status-badge';
import type { Platform } from '@/lib/types';

export function PlatformCard({ platform }: { platform: Platform }) {
  const { slug, displayName, status, siteUrl, errorMsg, domain } = platform;
  const swaggerUrl = siteUrl ? `${siteUrl}/api/docs` : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">{displayName}</h3>
          <p className="text-sm text-gray-500 font-mono">{slug}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Meta */}
      <div className="text-sm text-gray-500 space-y-1">
        <p>Domain: <span className="text-gray-700">{domain}</span></p>
        {siteUrl && (
          <p>
            Site:{' '}
            <a href={siteUrl} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:underline">
              {siteUrl}
            </a>
          </p>
        )}
        {swaggerUrl && (
          <p>
            Swagger:{' '}
            <a href={swaggerUrl} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:underline">
              {swaggerUrl}
            </a>
          </p>
        )}
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 font-mono break-all line-clamp-3">
          {errorMsg}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {status === 'RUNNING' && (
          <form action={stopPlatform.bind(null, slug)}>
            <button type="submit"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Stop
            </button>
          </form>
        )}
        {status === 'STOPPED' && (
          <form action={startPlatform.bind(null, slug)}>
            <button type="submit"
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors">
              Start
            </button>
          </form>
        )}
        {status === 'FAILED' && (
          <form action={retryPlatform.bind(null, slug)}>
            <button type="submit"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              Retry Deploy
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
