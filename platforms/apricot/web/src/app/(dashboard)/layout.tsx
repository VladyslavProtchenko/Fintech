import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { logoutAction } from '@/actions/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token');
  if (!token) redirect('/login');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <Link href="/dashboard">
            <Image src="/logo.svg" alt="Абрикос UA" width={120} height={30} />
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link href="/dashboard" className="hover:text-primary-700 transition">Баланс</Link>
            <Link href="/deposit" className="hover:text-primary-700 transition">Поповнення</Link>
            <Link href="/send" className="hover:text-primary-700 transition">Переказ</Link>
            <Link href="/history" className="hover:text-primary-700 transition">Історія</Link>
          </nav>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm text-slate-500 hover:text-red-600 transition font-medium"
            >
              Вийти
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {children}
      </main>
    </div>
  );
}
