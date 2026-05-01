import SendForm from '@/components/forms/send-form';

export default function SendPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
        Send Credits
      </h1>
      <p className="text-slate-500 text-sm mb-8">Transfer credits to another チェリー account</p>
      <div className="bg-white rounded-2xl border border-slate-200 p-8">
        <SendForm />
      </div>
    </div>
  );
}
