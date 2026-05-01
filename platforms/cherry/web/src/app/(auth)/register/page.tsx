import Image from 'next/image';
import Link from 'next/link';
import RegisterForm from '@/components/forms/register-form';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-950 to-primary-900 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <Link href="/">
            <Image src="/logo.svg" alt="チェリー" width={120} height={30} className="mx-auto mb-4" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
            Join チェリー
          </h1>
          <p className="text-sm text-slate-500 mt-1">Create your free account and earn credits</p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
