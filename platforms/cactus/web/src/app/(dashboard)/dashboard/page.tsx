import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/errors';

export const metadata: Metadata = { title: 'Dashboard' };

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

export default async function DashboardPage() {
  let balance = '0';
  let recent: Transaction[] = [];

  try {
    const [balRes, txRes] = await Promise.all([
      api<{ balance: string }>('/v1/wallet'),
      api<LedgerResponse>('/v1/wallet/ledger?limit=5&page=1'),
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
      <div className="bg-gradient-to-br from-teal-600 to-emerald-500 rounded-2xl p-8 text-white">
        <p className="text-teal-100 text-sm font-medium mb-1">My Money</p>
        <p className="text-5xl font-extrabold tracking-tight">
          ${Number(balance).toFixed(2)}
        </p>
        <div className="flex gap-3 mt-6">
          <Link
            href="/deposit"
            className="px-5 py-2.5 bg-white text-teal-700 text-sm font-bold rounded-xl hover:bg-teal-50 transition-colors"
          >
            + Load Balance
          </Link>
          <Link
            href="/send"
            className="px-5 py-2.5 bg-teal-400/30 border border-teal-300/50 text-white text-sm font-bold rounded-xl hover:bg-teal-400/40 transition-colors"
          >
            ↗ Wire Money
          </Link>
        </div>
      </div>

      {/* Recent — timeline */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Recent Activity</h2>
          <Link href="/history" className="text-sm text-teal-600 font-medium hover:underline">
            View ledger
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-slate-400 text-sm py-4 text-center">No transactions yet 🌵</p>
        ) : (
          <div className="relative pl-6 border-l-2 border-teal-100 space-y-4">
            {recent.map(tx => (
              <TimelineItem key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineItem({ tx }: { tx: Transaction }) {
  const isCredit = tx.type === 'deposit' || tx.type === 'received';
  const label =
    tx.type === 'deposit'
      ? 'Balance loaded'
      : tx.type === 'sent'
      ? `Wired to ${tx.counterparty ?? 'Unknown'}`
      : `Received from ${tx.counterparty ?? 'Unknown'}`;

  return (
    <div className="relative">
      <div className={`absolute -left-[25px] w-3 h-3 rounded-full border-2 border-white ${
        isCredit ? 'bg-teal-500' : 'bg-slate-300'
      }`} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="text-xs text-slate-400">{new Date(tx.createdAt).toLocaleDateString()}</p>
        </div>
        <span className={`text-sm font-bold ${isCredit ? 'text-teal-600' : 'text-slate-700'}`}>
          {isCredit ? '+' : '-'}${Number(tx.sum).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
