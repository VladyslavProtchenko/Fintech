'use client';

import { useState, useEffect, useActionState } from 'react';
import { searchUserAction } from '@/actions/user';
import { wireAction } from '@/actions/payment';

interface FoundUser {
  id: string;
  name: string;
  email: string;
}

export function SendForm() {
  const [step, setStep] = useState<'search' | 'amount' | 'done'>('search');
  const [recipient, setRecipient] = useState<FoundUser | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [sendError, sendFormAction, pending] = useActionState(wireAction, null);

  useEffect(() => {
    if (hasSubmitted && !pending && sendError === null) setStep('done');
  }, [hasSubmitted, pending, sendError]);

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = (e.currentTarget.elements.namedItem('email') as HTMLInputElement).value;
    setSearchError(null);
    setSearching(true);
    const user = await searchUserAction(email);
    setSearching(false);
    if (!user) {
      setSearchError('Користувача не знайдено');
      return;
    }
    setRecipient(user);
    setStep('amount');
  }

  if (step === 'done') {
    return (
      <div className="text-center py-6">
        <div className="text-5xl mb-4">✅</div>
        <p className="font-heading text-xl font-bold text-slate-800 mb-2">Переказ виконано!</p>
        <p className="text-slate-500 text-sm mb-6">Кошти надіслано {recipient?.name}</p>
        <button
          onClick={() => { setStep('search'); setRecipient(null); setHasSubmitted(false); }}
          className="px-5 py-2.5 bg-primary-700 text-white font-semibold rounded-lg hover:bg-primary-800 transition text-sm"
        >
          Новий переказ
        </button>
      </div>
    );
  }

  if (step === 'search') {
    return (
      <form onSubmit={handleSearch} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email одержувача</label>
          <input
            name="email"
            type="email"
            required
            placeholder="recipient@example.com"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700"
          />
        </div>
        {searchError && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{searchError}</p>
        )}
        <button
          type="submit"
          disabled={searching}
          className="w-full py-2.5 bg-primary-700 text-white font-semibold rounded-lg hover:bg-primary-800 transition disabled:opacity-50"
        >
          {searching ? 'Пошук...' : 'Знайти'}
        </button>
      </form>
    );
  }

  return (
    <form
      action={(fd) => { setHasSubmitted(true); sendFormAction(fd); }}
      className="space-y-4"
    >
      <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm">
        <p className="text-slate-500">Одержувач</p>
        <p className="font-semibold text-slate-800">{recipient?.name}</p>
        <p className="text-slate-500">{recipient?.email}</p>
      </div>
      <input type="hidden" name="toEmail" value={recipient?.email ?? ''} />
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Сума (USD)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="0.00"
            className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700"
          />
        </div>
      </div>
      {sendError && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{sendError}</p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setStep('search')}
          className="flex-1 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition text-sm"
        >
          Назад
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 py-2.5 bg-primary-700 text-white font-semibold rounded-lg hover:bg-primary-800 transition disabled:opacity-50 text-sm"
        >
          {pending ? 'Надсилання...' : 'Надіслати'}
        </button>
      </div>
    </form>
  );
}
