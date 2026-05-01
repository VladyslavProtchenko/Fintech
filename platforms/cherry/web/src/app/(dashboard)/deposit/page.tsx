import DepositForm from '@/components/forms/deposit-form';

export default function DepositPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
        Recharge Credits
      </h1>
      <p className="text-slate-500 text-sm mb-8">Add credits to your チェリー account</p>
      <div className="bg-white rounded-2xl border border-slate-200 p-8">
        <DepositForm />
      </div>
    </div>
  );
}
