import Image from 'next/image';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-teal-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Image src="/logo.svg" alt="Cactus Pay" width={150} height={34} priority />
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — gradient */}
      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-teal-500 to-emerald-400 text-white">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 left-10 text-9xl">🌵</div>
            <div className="absolute bottom-10 right-20 text-8xl">🤠</div>
            <div className="absolute top-1/2 right-1/3 text-7xl">🌶️</div>
          </div>
          <div className="relative max-w-6xl mx-auto px-6 py-28 text-center">
            <div className="inline-flex items-center gap-2 bg-white/20 text-white text-sm font-medium px-4 py-1.5 rounded-full mb-8 backdrop-blur-sm">
              <span className="w-2 h-2 bg-yellow-300 rounded-full" />
              Hecho en Mexico
            </div>
            <h1 className="text-6xl font-extrabold leading-tight mb-6 tracking-tight">
              Sharp payments.<br />
              Smooth <span className="text-yellow-300">sombrero</span>.
            </h1>
            <p className="text-xl text-teal-100 mb-10 max-w-xl mx-auto">
              Load your balance, wire money to amigos, and track every peso — all under one roof.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/register"
                className="px-8 py-4 text-base font-bold text-teal-700 bg-white rounded-xl hover:bg-teal-50 transition-colors shadow-lg"
              >
                Open Free Account
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 text-base font-bold text-white border-2 border-white/30 rounded-xl hover:bg-white/10 transition-colors"
              >
                Already a member →
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center text-3xl mb-5">
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 py-8 text-center text-sm text-slate-400">
        &copy; {new Date().getFullYear()} Cactus Pay. Hecho en Mexico con amor 🌵
      </footer>
    </div>
  );
}

const features = [
  {
    icon: '💰',
    title: 'Instant Load',
    desc: 'Add funds to your account in seconds. No waiting around in the desert heat.',
  },
  {
    icon: '🔄',
    title: 'Wire to Amigos',
    desc: 'Send money to any Cactus Pay member. Fast as a tumbleweed in the wind.',
  },
  {
    icon: '📒',
    title: 'Full Ledger',
    desc: 'Every peso tracked. Filter, browse, and stay on top of your finances.',
  },
];
