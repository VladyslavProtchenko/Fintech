'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { topupAction } from '@/actions/payment';

export function DepositForm() {
  const [error, action, pending] = useActionState(topupAction, null);

  return (
    <form action={action} className="space-y-5">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Amount (USD)</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-semibold">$</span>
          <input
            name="value"
            type="number"
            min="0.01"
            step="0.01"
            required
            className="w-full pl-8 pr-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400 text-lg font-semibold"
            placeholder="0.00"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full py-3.5 text-sm font-bold text-white bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Processing…' : '+ Top Up'}
      </button>
      <Link href="/dashboard" className="block text-center text-sm text-stone-400 hover:text-stone-600">
        ← Back to Dashboard
      </Link>
    </form>
  );
}
