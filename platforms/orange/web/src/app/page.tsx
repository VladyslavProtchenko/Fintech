import Image from 'next/image';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Nav */}
      <nav className="border-b border-orange-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Image src="/logo.svg" alt="Orange Pay" width={140} height={32} priority />
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — split layout */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left — text */}
            <div>
              <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
                <span className="w-2 h-2 bg-orange-500 rounded-full" />
                Fresh from Spain
              </div>
              <h1 className="text-5xl font-extrabold text-stone-900 leading-tight mb-6">
                Payments as fresh<br />
                as <span className="text-orange-500">oranges</span>
              </h1>
              <p className="text-lg text-stone-500 mb-8 max-w-md">
                Top up your balance, transfer funds to anyone, and track every transaction — all in one sunny dashboard.
              </p>
              <div className="flex items-center gap-4">
                <Link
                  href="/register"
                  className="px-7 py-3.5 text-base font-bold text-white bg-orange-500 rounded-xl hover:bg-orange-600 transition-colors shadow-sm"
                >
                  Open Free Account
                </Link>
                <Link
                  href="/login"
                  className="px-7 py-3.5 text-base font-bold text-orange-700 hover:text-orange-800 transition-colors"
                >
                  Already a member →
                </Link>
              </div>
            </div>

            {/* Right — feature cards */}
            <div className="space-y-4">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="bg-orange-50 border border-orange-100 rounded-2xl p-6 flex items-start gap-4"
                >
                  <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm">
                    {f.icon}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-stone-900 mb-1">{f.title}</h3>
                    <p className="text-stone-500 text-sm leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-stone-50 border-t border-stone-100 py-6 text-center text-sm text-stone-400">
        &copy; {new Date().getFullYear()} Orange Pay. Fresh payments from sunny Spain.
      </footer>
    </div>
  );
}

const features = [
  {
    icon: '🍊',
    title: 'Instant Top Up',
    desc: 'Add funds to your wallet in seconds. No waiting, no hidden fees.',
  },
  {
    icon: '🔄',
    title: 'Quick Transfers',
    desc: 'Send money to any Orange Pay member. Fast, secure, and simple.',
  },
  {
    icon: '📊',
    title: 'Full Transaction History',
    desc: 'Every operation tracked. Filter, paginate, and stay on top of your finances.',
  },
];
