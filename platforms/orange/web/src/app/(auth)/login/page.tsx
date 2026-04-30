import type { Metadata } from 'next';
import Image from 'next/image';
import { LoginForm } from '@/components/forms/login-form';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-orange-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo.svg" alt="Orange Pay" width={160} height={36} className="mx-auto mb-2" />
          <p className="text-stone-500 text-sm">Welcome back!</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h1 className="text-xl font-bold text-stone-900 mb-6">Sign in to your account</h1>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
