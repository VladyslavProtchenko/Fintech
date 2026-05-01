import Link from 'next/link';
import Image from 'next/image';
import { RegisterForm } from '@/components/forms/register-form';

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <Link href="/" className="mb-8">
        <Image src="/logo.svg" alt="Абрикос UA" width={140} height={35} />
      </Link>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="font-heading text-2xl font-bold text-slate-900 mb-1">Реєстрація</h1>
        <p className="text-slate-500 text-sm mb-6">Створіть обліковий запис безкоштовно</p>
        <RegisterForm />
        <p className="mt-5 text-center text-sm text-slate-500">
          Вже є акаунт?{' '}
          <Link href="/login" className="text-primary-700 font-medium hover:underline">
            Увійти
          </Link>
        </p>
      </div>
    </div>
  );
}
