'use client';

import { useActionState } from 'react';
import { depositAction } from '@/actions/payment';

export function DepositForm() {
  const [error, action, pending] = useActionState(depositAction, null);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Сума (USD)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
          <input
            name="amount"
            type="number"
            min="1"
            step="0.01"
            required
            placeholder="0.00"
            className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700"
          />
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 bg-primary-700 text-white font-semibold rounded-lg hover:bg-primary-800 transition disabled:opacity-50"
      >
        {pending ? 'Поповнення...' : 'Поповнити'}
      </button>
    </form>
  );
}
