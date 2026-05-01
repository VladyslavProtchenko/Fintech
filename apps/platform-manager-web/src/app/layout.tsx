import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Platform Manager',
  description: 'Manage white-label payment platforms',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <a href="/platforms" className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">PM</span>
              </div>
              <span className="font-semibold text-gray-900">Platform Manager</span>
            </a>
            <a
              href="/platforms/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              + New Platform
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
