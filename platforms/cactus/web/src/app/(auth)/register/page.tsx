import type { Metadata } from 'next';
import Image from 'next/image';
import { RegisterForm } from '@/components/forms/register-form';

export const metadata: Metadata = { title: 'Create Account' };

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo.svg" alt="Cactus Pay" width={160} height={36} className="mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Join the Cactus family 🌵</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-6">Create your account</h1>
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
