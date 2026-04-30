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

interface ActivityResponse {
  items: Transaction[];
  total: number;
  page: number;
  limit: number;
}

export default async function DashboardPage() {
  let balance = '0';
  let recent: Transaction[] = [];

  try {
    const [balRes, actRes] = await Promise.all([
      api<{ balance: string }>('/account/balance'),
      api<ActivityResponse>('/account/activity?limit=5&page=1'),
    ]);
    balance = balRes.balance;
    recent = actRes.items;
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthorized) redirect('/login');
    throw err;
  }

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-8 text-white">
        <p className="text-green-100 text-sm font-medium mb-1">Your Balance</p>
        <p className="text-5xl font-extrabold tracking-tight">
          ${Number(balance).toFixed(2)}
        </p>
        <div className="flex gap-3 mt-6">
          <Link
            href="/deposit"
            className="px-5 py-2.5 bg-white text-green-700 text-sm font-bold rounded-xl hover:bg-green-50 transition-colors"
          >
            + Add Funds
          </Link>
          <Link
            href="/send"
            className="px-5 py-2.5 bg-green-400 bg-opacity-30 border border-green-300 border-opacity-50 text-white text-sm font-bold rounded-xl hover:bg-opacity-40 transition-colors"
          >
            ↗ Send to Friend
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">Recent Activity</h2>
          <Link href="/history" className="text-sm text-green-600 font-medium hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">No transactions yet</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {recent.map(tx => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const isCredit = tx.type === 'deposit' || tx.type === 'received';
  const label =
    tx.type === 'deposit'
      ? 'Added Funds'
      : tx.type === 'sent'
      ? `Sent to ${tx.counterparty ?? 'Unknown'}`
      : `Received from ${tx.counterparty ?? 'Unknown'}`;

  return (
    <li className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm ${
            isCredit ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
          }`}
        >
          {tx.type === 'deposit' ? '↓' : tx.type === 'sent' ? '↑' : '↓'}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleDateString()}</p>
        </div>
      </div>
      <span
        className={`text-sm font-bold ${isCredit ? 'text-green-600' : 'text-gray-700'}`}
      >
        {isCredit ? '+' : '-'}${Number(tx.amount).toFixed(2)}
      </span>
    </li>
  );
}
