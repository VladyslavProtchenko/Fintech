import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/errors';

export const metadata: Metadata = { title: 'Activity' };

interface Transaction {
  id: string;
  type: 'deposit' | 'sent' | 'received';
  amount: string;
  status: string;
  counterparty: string | null;
  createdAt: string;
}

interface ActivityResponse {
  items: Transaction[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 10;

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Deposits', value: 'deposit' },
  { label: 'Sent', value: 'sent' },
  { label: 'Received', value: 'received' },
];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const type = params.type ?? '';

  let data: ActivityResponse = { items: [], total: 0, page: 1, limit: LIMIT };

  try {
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (type) qs.set('type', type);
    data = await api<ActivityResponse>(`/account/activity?${qs}`);
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthorized) redirect('/login');
    throw err;
  }

  const totalPages = Math.ceil(data.total / LIMIT);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-gray-900">Activity</h1>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <Link
            key={f.value}
            href={`/history?${new URLSearchParams({ page: '1', ...(f.value ? { type: f.value } : {}) })}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              type === f.value
                ? 'bg-green-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-green-300'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Transaction list */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
        {data.items.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-12">No transactions found</p>
        ) : (
          data.items.map(tx => <ActivityRow key={tx.id} tx={tx} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Link
            href={`/history?${new URLSearchParams({ page: String(page - 1), ...(type ? { type } : {}) })}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 transition-colors ${
              page <= 1 ? 'pointer-events-none opacity-30' : 'hover:border-green-300'
            }`}
          >
            ← Previous
          </Link>
          <span className="text-sm text-gray-400">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`/history?${new URLSearchParams({ page: String(page + 1), ...(type ? { type } : {}) })}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 transition-colors ${
              page >= totalPages ? 'pointer-events-none opacity-30' : 'hover:border-green-300'
            }`}
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ tx }: { tx: Transaction }) {
  const isCredit = tx.type === 'deposit' || tx.type === 'received';

  const typeConfig = {
    deposit: { icon: '↓', label: 'Added Funds', bg: 'bg-green-50', color: 'text-green-600' },
    sent: { icon: '↑', label: `To: ${tx.counterparty ?? '—'}`, bg: 'bg-gray-50', color: 'text-gray-500' },
    received: { icon: '↓', label: `From: ${tx.counterparty ?? '—'}`, bg: 'bg-green-50', color: 'text-green-600' },
  }[tx.type];

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-4">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${typeConfig.bg} ${typeConfig.color}`}>
          {typeConfig.icon}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{typeConfig.label}</p>
          <p className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleString()}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${isCredit ? 'text-green-600' : 'text-gray-800'}`}>
          {isCredit ? '+' : '-'}${Number(tx.amount).toFixed(2)}
        </p>
        <p className="text-xs text-gray-400 capitalize">{tx.status}</p>
      </div>
    </div>
  );
}
