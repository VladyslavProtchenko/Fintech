'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { wireAction } from '@/actions/payment';
import { searchUserAction } from '@/actions/user';

type Step = 'email' | 'amount' | 'done';

export function SendForm() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSearching, startSearch] = useTransition();
  const [sendError, sendFormAction, pending] = useActionState(wireAction, null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (hasSubmitted && !pending && sendError === null) {
      setStep('done');
    }
  }, [hasSubmitted, pending, sendError]);

  function handleSearch() {
    setSearchError('');
    startSearch(async () => {
      const result = await searchUserAction(email);
      if (!result || !result.found) {
        setSearchError('No Cactus Pay member found with that email');
        return;
      }
      setRecipientName(result.name ?? email);
      setStep('amount');
    });
  }

  if (step === 'done') {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="text-5xl">🌵</div>
        <h2 className="text-xl font-bold text-slate-900">Wire Complete!</h2>
        <p className="text-slate-500 text-sm">Your pesos are on their way to {recipientName}</p>
        <Link href="/dashboard" className="block text-sm text-teal-600 font-semibold hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Email */}
      <div className={step !== 'email' ? 'opacity-50 pointer-events-none' : ''}>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Recipient email
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 text-sm"
            placeholder="amigo@example.com"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={!email || isSearching}
            className="px-4 py-2.5 text-sm font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {isSearching ? '…' : 'Find'}
          </button>
        </div>
        {searchError && (
          <p className="text-red-500 text-xs mt-1.5">{searchError}</p>
        )}
      </div>

      {/* Step 2: Amount */}
      {step === 'amount' && (
        <form
          action={(fd) => {
            setHasSubmitted(true);
            sendFormAction(fd);
          }}
          className="space-y-4"
        >
          <input type="hidden" name="recipientEmail" value={email} />

          <div className="bg-teal-50 rounded-xl px-4 py-3 flex items-center gap-2">
            <span className="text-teal-600 text-sm">✓</span>
            <span className="text-sm font-medium text-teal-800">Sending to: {recipientName}</span>
            <button
              type="button"
              onClick={() => { setStep('email'); setRecipientName(''); }}
              className="ml-auto text-xs text-slate-400 hover:text-slate-600"
            >
              Change
            </button>
          </div>

          {sendError && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{sendError}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
              <input
                name="sum"
                type="number"
                min="0.01"
                step="0.01"
                required
                className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 text-lg font-semibold"
                placeholder="0.00"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3.5 text-sm font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {pending ? 'Sending…' : '↗ Wire Money'}
          </button>
        </form>
      )}

      <Link href="/dashboard" className="block text-center text-sm text-slate-400 hover:text-slate-600">
        ← Back to Dashboard
      </Link>
    </div>
  );
}
