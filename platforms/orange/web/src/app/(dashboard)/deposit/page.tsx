import type { Metadata } from 'next';
import { DepositForm } from '@/components/forms/deposit-form';

export const metadata: Metadata = { title: 'Top Up' };

export default function DepositPage() {
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-stone-100 p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">
            🍊
          </div>
          <h1 className="text-xl font-bold text-stone-900">Top Up</h1>
          <p className="text-stone-400 text-sm mt-1">Enter any amount to add to your balance</p>
        </div>
        <DepositForm />
      </div>
    </div>
  );
}
