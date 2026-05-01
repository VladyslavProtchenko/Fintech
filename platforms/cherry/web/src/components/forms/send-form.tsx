'use client';

import { useState, useEffect, useActionState } from 'react';
import { wireAction } from '@/actions/payment';
import { searchUserAction } from '@/actions/user';

type Step = 'search' | 'amount' | 'confirm' | 'done';

export default function SendForm() {
  const [step, setStep] = useState<Step>('search');
  const [recipient, setRecipient] = useState<{ name: string; email: string } | null>(null);
  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [sendError, sendFormAction, pending] = useActionState(wireAction, null);

  // Detect success after wire action
  useEffect(() => {
    if (hasSubmitted && !pending && sendError === null) {
      setStep('done');
    }
  }, [hasSubmitted, pending, sendError]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSearchError('');
    const found = await searchUserAction(searchEmail);
    setSearching(false);
    if (!found) {
      setSearchError('No account found with that email');
      return;
    }
    setRecipient(found);
    setStep('amount');
  }

  if (step === 'done') {
    return (
      <div className="text-center py-12">
        <p className="text-5xl mb-4">🍒</p>
        <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
          Credits Sent!
        </h2>
        <p className="text-slate-500 text-sm mb-6">Your credits have been sent to {recipient?.name}.</p>
        <button
          onClick={() => { setStep('search'); setRecipient(null); setSearchEmail(''); setHasSubmitted(false); }}
          className="px-6 py-2.5 bg-primary-700 text-white font-semibold rounded-lg hover:bg-primary-800 transition text-sm"
        >
          Send Again
        </button>
      </div>
    );
  }

  if (step === 'search') {
    return (
      <form onSubmit={handleSearch} className="space-y-4 max-w-md">
        {searchError && (
          <div className="bg-primary-50 border border-primary-200 text-primary-800 text-sm px-4 py-3 rounded-lg">
            {searchError}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Recipient Email</label>
          <input
            type="email"
            required
            value={searchEmail}
            onChange={e => setSearchEmail(e.target.value)}
            placeholder="friend@example.com"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="w-full py-2.5 bg-primary-700 text-white font-semibold rounded-lg hover:bg-primary-800 disabled:opacity-60 transition"
        >
          {searching ? 'Searching…' : 'Find Account'}
        </button>
      </form>
    );
  }

  if (step === 'amount' && recipient) {
    return (
      <form
        action={(fd) => { setHasSubmitted(true); sendFormAction(fd); }}
        className="space-y-4 max-w-md"
      >
        {sendError && (
          <div className="bg-primary-50 border border-primary-200 text-primary-800 text-sm px-4 py-3 rounded-lg">
            {sendError}
          </div>
        )}
        <div className="bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
          <p className="text-xs text-slate-500 mb-0.5">Sending to</p>
          <p className="font-semibold text-slate-800">{recipient.name}</p>
          <p className="text-xs text-slate-400">{recipient.email}</p>
        </div>
        <input type="hidden" name="recipient" value={recipient.email} />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Amount (USD)</label>
          <input
            name="amount"
            type="number"
            required
            min="1"
            step="1"
            placeholder="50"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep('search')}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition text-sm"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-2.5 bg-primary-700 text-white font-semibold rounded-lg hover:bg-primary-800 disabled:opacity-60 transition"
          >
            {pending ? 'Sending…' : 'Send Credits'}
          </button>
        </div>
      </form>
    );
  }

  return null;
}
