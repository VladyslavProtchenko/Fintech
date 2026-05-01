import { api, ApiError } from '@/lib/api';
import { redirect } from 'next/navigation';
import Link from 'next/link';

interface MappedTransaction {
  id: string;
  type: 'deposit' | 'sent' | 'received';
  amount: string;
  status: string;
  counterparty: string | null;
  createdAt: string;
}

interface LedgerResponse {
  items: MappedTransaction[];
  total: number;
  page: number;
  limit: number;
}

const typeLabel: Record<string, string> = {
  deposit: 'Recharge',
  sent: 'Sent',
  received: 'Received',
};

const typeBadge: Record<string, string> = {
  deposit: 'bg-green-100 text-green-700',
  sent: 'bg-red-100 text-red-700',
  received: 'bg-blue-100 text-blue-700',
};

const LIMIT = 10;

interface Props {
  searchParams: Promise<{ page?: string; type?: string }>;
}

export default async function HistoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page ?? '1', 10);
  const type = params.type;

  let data: LedgerResponse = { items: [], total: 0, page, limit: LIMIT };

  try {
    data = await api<LedgerResponse>('/account/ledger', {
      query: { page, limit: LIMIT, ...(type ? { type } : {}) },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    // Non-401: show empty state
  }

  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
        Activity Log
      </h1>

      {/* Type filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { label: 'All', value: undefined },
          { label: 'Recharge', value: 'deposit' },
          { label: 'Sent', value: 'sent' },
          { label: 'Received', value: 'received' },
        ].map(f => (
          <Link
            key={f.label}
            href={f.value ? `/history?type=${f.value}` : '/history'}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              type === f.value || (!type && !f.value)
                ? 'bg-primary-700 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-300'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {data.items.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">🍒</p>
          <p>No transactions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map(tx => (
            <div key={tx.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center justify-between hover:border-primary-200 transition">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${typeBadge[tx.type] ?? 'bg-slate-100 text-slate-600'}`}>
                  {typeLabel[tx.type] ?? tx.type}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {tx.counterparty ?? 'Credit Recharge'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <span className={`font-bold ${tx.type === 'sent' ? 'text-red-600' : 'text-green-600'}`}>
                {tx.type === 'sent' ? '-' : '+'}${tx.amount}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Link
              key={p}
              href={`/history?page=${p}${type ? `&type=${type}` : ''}`}
              className={`w-9 h-9 flex items-center justify-center rounded-full text-sm font-medium transition ${
                p === page
                  ? 'bg-primary-700 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-300'
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
