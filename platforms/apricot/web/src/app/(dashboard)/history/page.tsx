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

interface TransactionsResponse {
  items: MappedTransaction[];
  total: number;
  page: number;
  limit: number;
}

const typeLabel: Record<string, string> = {
  deposit: 'Поповнення',
  sent: 'Переказ',
  received: 'Отримано',
};

const typeBadge: Record<string, string> = {
  deposit: 'bg-green-100 text-green-700',
  sent: 'bg-red-100 text-red-700',
  received: 'bg-blue-100 text-blue-700',
};

const LIMIT = 10;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? '1', 10);
  const type = params.type;

  let data: TransactionsResponse = { items: [], total: 0, page: 1, limit: LIMIT };

  try {
    data = await api<TransactionsResponse>('/wallet/transactions', {
      query: { page, limit: LIMIT, ...(type ? { type } : {}) },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
  }

  const totalPages = Math.ceil(data.total / LIMIT);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-slate-900 mb-6">Історія операцій</h1>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { label: 'Всі', value: undefined },
          { label: 'Поповнення', value: 'deposit' },
          { label: 'Надіслано', value: 'sent' },
          { label: 'Отримано', value: 'received' },
        ].map(f => {
          const active = type === f.value || (!type && !f.value);
          const href = f.value ? `/history?type=${f.value}` : '/history';
          return (
            <Link
              key={f.label}
              href={href}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                active
                  ? 'bg-primary-700 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-700'
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* Transactions */}
      {data.items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">📋</p>
          <p>Транзакцій поки немає</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map(tx => (
            <div key={tx.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadge[tx.type] ?? 'bg-slate-100 text-slate-600'}`}>
                  {typeLabel[tx.type] ?? tx.type}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {tx.counterparty ?? 'Поповнення гаманця'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(tx.createdAt).toLocaleString('uk-UA')}
                  </p>
                </div>
              </div>
              <span className={`font-semibold ${tx.type === 'sent' ? 'text-red-600' : 'text-green-600'}`}>
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
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition ${
                p === page
                  ? 'bg-primary-700 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-700'
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
