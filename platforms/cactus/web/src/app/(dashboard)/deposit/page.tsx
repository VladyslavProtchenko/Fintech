import type { Metadata } from 'next';
import { DepositForm } from '@/components/forms/deposit-form';

export const metadata: Metadata = { title: 'Load Balance' };

export default function DepositPage() {
  return (
    <div className="max-w-md">
      <div className="bg-white rounded-2xl border border-slate-100 p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">
            🌵
          </div>
          <h1 className="text-xl font-bold text-slate-900">Load Balance</h1>
          <p className="text-slate-400 text-sm mt-1">Enter any amount to grow your cactus</p>
        </div>
        <DepositForm />
      </div>
    </div>
  );
}
