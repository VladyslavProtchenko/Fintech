'use client';

import { useActionState } from 'react';
import { loginAction } from '@/actions/auth';

export function LoginForm() {
  const [error, action, pending] = useActionState(loginAction, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Пароль</label>
        <input
          name="password"
          type="password"
          required
          placeholder="••••••••"
          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700"
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 bg-primary-700 text-white font-semibold rounded-lg hover:bg-primary-800 transition disabled:opacity-50"
      >
        {pending ? 'Вхід...' : 'Увійти'}
      </button>
    </form>
  );
}
