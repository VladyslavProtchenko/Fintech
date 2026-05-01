import type { Metadata } from 'next';
import { Montserrat, Nunito_Sans } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-heading',
  display: 'swap',
});

const nunitoSans = Nunito_Sans({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Абрикос UA',
  description: 'Швидкі та надійні платежі в Україні',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={`${montserrat.variable} ${nunitoSans.variable}`}>
      <body className="font-body bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
