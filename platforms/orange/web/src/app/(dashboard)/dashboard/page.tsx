import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/errors';

export const metadata: Metadata = { title: 'Dashboard' };

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

export default async function DashboardPage() {
  let balance = '0';
  let recent: Transaction[] = [];

  try {
    const [balRes, txRes] = await Promise.all([
      api<{ balance: string }>('/wallet/balance'),
      api<HistoryResponse>('/wallet/history?limit=5&page=1'),
    ]);
    balance = balRes.balance;
    recent = txRes.items;
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthorized) redirect('/login');
    throw err;
  }

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-8 text-white">
        <p className="text-orange-100 text-sm font-medium mb-1">Available Funds</p>
        <p className="text-5xl font-extrabold tracking-tight">
          ${Number(balance).toFixed(2)}
        </p>
        <div className="flex gap-3 mt-6">
          <Link
            href="/deposit"
            className="px-5 py-2.5 bg-white text-orange-700 text-sm font-bold rounded-xl hover:bg-orange-50 transition-colors"
          >
            + Top Up
          </Link>
          <Link
            href="/send"
            className="px-5 py-2.5 bg-orange-400 bg-opacity-30 border border-orange-300 border-opacity-50 text-white text-sm font-bold rounded-xl hover:bg-opacity-40 transition-colors"
          >
            ↗ Transfer
          </Link>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl border border-stone-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-stone-900">Recent Transactions</h2>
          <Link href="/history" className="text-sm text-orange-600 font-medium hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-stone-400 text-sm py-4 text-center">No transactions yet</p>
        ) : (
          <div className="space-y-3">
            {recent.map(tx => (
              <TransactionCard key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionCard({ tx }: { tx: Transaction }) {
  const isCredit = tx.type === 'deposit' || tx.type === 'received';
  const label =
    tx.type === 'deposit'
      ? 'Top Up'
      : tx.type === 'sent'
      ? `Transfer to ${tx.counterparty ?? 'Unknown'}`
      : `Received from ${tx.counterparty ?? 'Unknown'}`;

  return (
    <div className="flex items-center justify-between bg-stone-50 rounded-xl px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
            isCredit ? 'bg-orange-100 text-orange-600' : 'bg-stone-200 text-stone-500'
          }`}
        >
          {tx.type === 'deposit' ? '↓' : tx.type === 'sent' ? '↑' : '↓'}
        </div>
        <div>
          <p className="text-sm font-medium text-stone-900">{label}</p>
          <p className="text-xs text-stone-400">{new Date(tx.createdAt).toLocaleDateString()}</p>
        </div>
      </div>
      <span
        className={`text-sm font-bold ${isCredit ? 'text-orange-600' : 'text-stone-700'}`}
      >
        {isCredit ? '+' : '-'}${Number(tx.amount).toFixed(2)}
      </span>
    </div>
  );
}
