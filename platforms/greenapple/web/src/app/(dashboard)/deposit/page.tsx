import type { Metadata } from 'next';
import { DepositForm } from '@/components/forms/deposit-form';

export const metadata: Metadata = { title: 'Add Funds' };

export default function DepositPage() {
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">
            💚
          </div>
          <h1 className="text-xl font-bold text-gray-900">Add Funds</h1>
          <p className="text-gray-400 text-sm mt-1">Enter any amount to top up your balance</p>
        </div>
        <DepositForm />
      </div>
    </div>
  );
}
