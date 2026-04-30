import type { Metadata } from 'next';
import { SendForm } from '@/components/forms/send-form';

export const metadata: Metadata = { title: 'Send to Friend' };

export default function SendPage() {
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">
            🍃
          </div>
          <h1 className="text-xl font-bold text-gray-900">Send to Friend</h1>
          <p className="text-gray-400 text-sm mt-1">Find a member by email and transfer funds</p>
        </div>
        <SendForm />
      </div>
    </div>
  );
}
