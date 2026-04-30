import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/errors';

export const metadata: Metadata = { title: 'Transactions' };

interface Transaction {
  id: string;
  type: 'deposit' | 'sent' | 'received';
  amount: string;
  status: string;
  counterparty: string | null;
  createdAt: string;
}

interface HistoryResponse {
  items: Transaction[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 10;

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Top Ups', value: 'deposit' },
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

  let data: HistoryResponse = { items: [], total: 0, page: 1, limit: LIMIT };

  try {
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (type) qs.set('type', type);
    data = await api<HistoryResponse>(`/wallet/history?${qs}`);
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthorized) redirect('/login');
    throw err;
  }

  const totalPages = Math.ceil(data.total / LIMIT);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-stone-900">Transactions</h1>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <Link
            key={f.value}
            href={`/history?${new URLSearchParams({ page: '1', ...(f.value ? { type: f.value } : {}) })}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              type === f.value
                ? 'bg-orange-500 text-white'
                : 'bg-white border border-stone-200 text-stone-600 hover:border-orange-300'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Transaction cards */}
      <div className="space-y-3">
        {data.items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-100 py-12 text-center">
            <p className="text-stone-400 text-sm">No transactions found</p>
          </div>
        ) : (
          data.items.map(tx => <HistoryCard key={tx.id} tx={tx} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Link
            href={`/history?${new URLSearchParams({ page: String(page - 1), ...(type ? { type } : {}) })}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg border border-stone-200 transition-colors ${
              page <= 1 ? 'pointer-events-none opacity-30' : 'hover:border-orange-300'
            }`}
          >
            ← Previous
          </Link>
          <span className="text-sm text-stone-400">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`/history?${new URLSearchParams({ page: String(page + 1), ...(type ? { type } : {}) })}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg border border-stone-200 transition-colors ${
              page >= totalPages ? 'pointer-events-none opacity-30' : 'hover:border-orange-300'
            }`}
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}

function HistoryCard({ tx }: { tx: Transaction }) {
  const isCredit = tx.type === 'deposit' || tx.type === 'received';

  const typeConfig = {
    deposit: { icon: '↓', label: 'Top Up', badgeBg: 'bg-orange-100', badgeText: 'text-orange-700' },
    sent: { icon: '↑', label: `To: ${tx.counterparty ?? '—'}`, badgeBg: 'bg-stone-100', badgeText: 'text-stone-600' },
    received: { icon: '↓', label: `From: ${tx.counterparty ?? '—'}`, badgeBg: 'bg-orange-100', badgeText: 'text-orange-700' },
  }[tx.type];

  return (
    <div className="bg-white rounded-xl border border-stone-100 px-5 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${typeConfig.badgeBg} ${typeConfig.badgeText}`}>
          {typeConfig.icon}
        </div>
        <div>
          <p className="text-sm font-medium text-stone-900">{typeConfig.label}</p>
          <p className="text-xs text-stone-400">{new Date(tx.createdAt).toLocaleString()}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${isCredit ? 'text-orange-600' : 'text-stone-800'}`}>
          {isCredit ? '+' : '-'}${Number(tx.amount).toFixed(2)}
        </p>
        <p className="text-xs text-stone-400 capitalize">{tx.status}</p>
      </div>
    </div>
  );
}
