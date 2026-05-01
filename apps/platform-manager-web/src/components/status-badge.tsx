import type { PlatformStatus } from '@/lib/types';

const styles: Record<PlatformStatus, string> = {
  CREATING: 'bg-blue-100 text-blue-700',
  BUILDING: 'bg-amber-100 text-amber-700',
  RUNNING: 'bg-green-100 text-green-700',
  STOPPED: 'bg-gray-100 text-gray-600',
  FAILED: 'bg-red-100 text-red-700',
};

const labels: Record<PlatformStatus, string> = {
  CREATING: 'Creating',
  BUILDING: 'Building',
  RUNNING: 'Running',
  STOPPED: 'Stopped',
  FAILED: 'Failed',
};

export function StatusBadge({ status }: { status: PlatformStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status === 'CREATING' || status === 'BUILDING' ? (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      ) : null}
      {labels[status]}
    </span>
  );
}
