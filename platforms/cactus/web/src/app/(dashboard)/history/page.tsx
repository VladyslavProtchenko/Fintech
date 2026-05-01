import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/errors';

export const metadata: Metadata = { title: 'Ledger' };

interface Transaction {
  id: string;
  type: 'deposit' | 'sent' | 'received';
  sum: string;
  status: string;
  counterparty: string | null;
  createdAt: string;
}

interface LedgerResponse {
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

  let data: LedgerResponse = { items: [], total: 0, page: 1, limit: LIMIT };

  try {
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (type) qs.set('type', type);
    data = await api<LedgerResponse>(`/v1/wallet/ledger?${qs}`);
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthorized) redirect('/login');
    throw err;
  }

  const totalPages = Math.ceil(data.total / LIMIT);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-slate-900">Ledger</h1>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <Link
            key={f.value}
            href={`/history?${new URLSearchParams({ page: '1', ...(f.value ? { type: f.value } : {}) })}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              type === f.value
                ? 'bg-teal-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Timeline */}
      {data.items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-12 text-center">
          <p className="text-slate-400 text-sm">No transactions found 🌵</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="relative pl-6 border-l-2 border-teal-100 space-y-5">
            {data.items.map(tx => (
              <TimelineRow key={tx.id} tx={tx} />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Link
            href={`/history?${new URLSearchParams({ page: String(page - 1), ...(type ? { type } : {}) })}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 transition-colors ${
              page <= 1 ? 'pointer-events-none opacity-30' : 'hover:border-teal-300'
            }`}
          >
            ← Previous
          </Link>
          <span className="text-sm text-slate-400">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`/history?${new URLSearchParams({ page: String(page + 1), ...(type ? { type } : {}) })}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 transition-colors ${
              page >= totalPages ? 'pointer-events-none opacity-30' : 'hover:border-teal-300'
            }`}
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ tx }: { tx: Transaction }) {
  const isCredit = tx.type === 'deposit' || tx.type === 'received';

  const label =
    tx.type === 'deposit'
      ? 'Balance loaded'
      : tx.type === 'sent'
      ? `Wired to ${tx.counterparty ?? '—'}`
      : `Received from ${tx.counterparty ?? '—'}`;

  return (
    <div className="relative">
      <div className={`absolute -left-[25px] w-3 h-3 rounded-full border-2 border-white ${
        isCredit ? 'bg-teal-500' : 'bg-slate-300'
      }`} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="text-xs text-slate-400">{new Date(tx.createdAt).toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${isCredit ? 'text-teal-600' : 'text-slate-800'}`}>
            {isCredit ? '+' : '-'}${Number(tx.sum).toFixed(2)}
          </p>
          <p className="text-xs text-slate-400 capitalize">{tx.status}</p>
        </div>
      </div>
    </div>
  );
}
