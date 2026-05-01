import { api, ApiError } from '@/lib/api';
import { redirect } from 'next/navigation';
import Link from 'next/link';

interface BalanceResponse {
  balance: string;
}

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

export default async function DashboardPage() {
  let balance = '0.00';
  let transactions: MappedTransaction[] = [];

  try {
    const [balRes, txRes] = await Promise.all([
      api<BalanceResponse>('/account'),
      api<LedgerResponse>('/account/ledger', { query: { limit: '5', page: '1' } }),
    ]);
    balance = balRes.balance;
    transactions = txRes.items;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    // Non-401: show empty state gracefully
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
        My Credits
      </h1>

      {/* Balance card */}
      <div className="bg-gradient-to-br from-primary-700 to-primary-950 rounded-2xl p-8 text-white mb-8 flex items-center justify-between">
        <div>
          <p className="text-primary-300 text-sm font-medium mb-1">Available Credits</p>
          <p className="text-4xl font-extrabold" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
            ${balance}
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <Link
            href="/deposit"
            className="px-4 py-2 bg-accent-400 text-primary-950 font-bold text-sm rounded-full hover:bg-accent-300 transition"
          >
            + Recharge
          </Link>
          <Link
            href="/send"
            className="px-4 py-2 bg-white/20 text-white font-semibold text-sm rounded-full hover:bg-white/30 transition"
          >
            → Send Credits
          </Link>
        </div>
      </div>

      {/* Recent activity */}
      <h2 className="text-lg font-semibold text-slate-800 mb-4" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
        Recent Activity
      </h2>
      {transactions.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">🍒</p>
          <p>No transactions yet. Recharge to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map(tx => (
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
                    {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
    </div>
  );
}
