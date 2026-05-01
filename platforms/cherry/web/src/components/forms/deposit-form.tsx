'use client';

import { useActionState } from 'react';
import { depositAction } from '@/actions/payment';

export default function DepositForm() {
  const [error, formAction, pending] = useActionState(depositAction, null);

  return (
    <form action={formAction} className="space-y-4 max-w-md">
      {error && (
        <div className="bg-primary-50 border border-primary-200 text-primary-800 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Amount (USD)</label>
        <input
          name="amount"
          type="number"
          required
          min="1"
          step="1"
          placeholder="100"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <p className="text-xs text-slate-400 mt-1">Minimum recharge: $1</p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 bg-primary-700 text-white font-semibold rounded-lg hover:bg-primary-800 disabled:opacity-60 transition"
      >
        {pending ? 'Processing…' : 'Recharge Credits'}
      </button>
    </form>
  );
}
