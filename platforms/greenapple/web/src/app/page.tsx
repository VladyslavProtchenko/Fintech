import Image from 'next/image';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Image src="/logo.svg" alt="GreenApple" width={140} height={32} priority />
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold text-green-700 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            Fast &amp; Secure Payments
          </div>
          <h1 className="text-5xl font-extrabold text-gray-900 leading-tight mb-6">
            Fresh payments,<br />
            <span className="text-green-500">every day</span>
          </h1>
          <p className="text-xl text-gray-500 max-w-xl mx-auto mb-10">
            Send money to friends, add funds instantly, and track every transaction — all in one clean dashboard.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="px-7 py-3.5 text-base font-bold text-white bg-green-500 rounded-xl hover:bg-green-600 transition-colors shadow-sm"
            >
              Create Free Account
            </Link>
            <Link
              href="/login"
              className="px-7 py-3.5 text-base font-bold text-green-700 hover:text-green-800 transition-colors"
            >
              Already have account →
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="bg-white border-t border-gray-100 py-16">
          <div className="max-w-5xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {features.map((f) => (
                <div key={f.title} className="text-center p-6">
                  <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-100 py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} GreenApple. Fresh payments, every day.
      </footer>
    </div>
  );
}

const features = [
  {
    icon: '🍃',
    title: 'Instant Transfers',
    desc: 'Send money to any GreenApple member in seconds. No delays, no hidden fees.',
  },
  {
    icon: '💚',
    title: 'Add Funds Freely',
    desc: 'Top up your balance anytime. Watch your wallet grow with every deposit.',
  },
  {
    icon: '📋',
    title: 'Full Activity Log',
    desc: 'Every transaction tracked. Filter by type, paginate through history easily.',
  },
];
