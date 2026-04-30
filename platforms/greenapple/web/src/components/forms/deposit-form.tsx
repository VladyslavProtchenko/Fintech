'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { depositAction } from '@/actions/payment';

export function DepositForm() {
  const [error, action, pending] = useActionState(depositAction, null);

  return (
    <form action={action} className="space-y-5">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Amount (USD)</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400 text-lg font-semibold"
            placeholder="0.00"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full py-3.5 text-sm font-bold text-white bg-green-500 rounded-xl hover:bg-green-600 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Processing…' : '+ Add Funds'}
      </button>
      <Link href="/dashboard" className="block text-center text-sm text-gray-400 hover:text-gray-600">
        ← Back to Dashboard
      </Link>
    </form>
  );
}
