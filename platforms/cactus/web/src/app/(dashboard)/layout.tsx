import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { logoutAction } from '@/actions/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) redirect('/login');

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Main content — left side */}
      <main className="flex-1 p-8 max-w-4xl">{children}</main>

      {/* Sidebar — right side */}
      <aside className="w-56 bg-white border-l border-slate-100 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-slate-100">
          <Link href="/dashboard">
            <Image src="/logo.svg" alt="Cactus Pay" width={120} height={28} />
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <SidebarLink href="/dashboard">Dashboard</SidebarLink>
          <SidebarLink href="/deposit">Load Balance</SidebarLink>
          <SidebarLink href="/send">Wire Money</SidebarLink>
          <SidebarLink href="/history">Ledger</SidebarLink>
        </nav>
        <div className="p-3 border-t border-slate-100">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}

function SidebarLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center px-3 py-2 text-sm font-medium text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
    >
      {children}
    </Link>
  );
}
