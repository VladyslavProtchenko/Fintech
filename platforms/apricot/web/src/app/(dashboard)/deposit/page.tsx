import { DepositForm } from '@/components/forms/deposit-form';

export default function DepositPage() {
  return (
    <div className="max-w-md mx-auto">
      <h1 className="font-heading text-2xl font-bold text-slate-900 mb-2">Поповнення рахунку</h1>
      <p className="text-slate-500 text-sm mb-6">Введіть суму для поповнення гаманця</p>
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <DepositForm />
      </div>
    </div>
  );
}
