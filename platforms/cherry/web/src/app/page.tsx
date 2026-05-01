import Image from 'next/image';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-primary-100">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
          <Link href="/">
            <Image src="/logo.svg" alt="チェリー" width={140} height={35} priority />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#flavors" className="hover:text-primary-700 transition">Flavors</a>
            <a href="#about" className="hover:text-primary-700 transition">Our Story</a>
            <a href="#markets" className="hover:text-primary-700 transition">Markets</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-primary-700 transition">
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold px-4 py-2 bg-primary-700 text-white rounded-full hover:bg-primary-800 transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-24 pb-20 bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-10 w-64 h-64 rounded-full bg-primary-400 blur-3xl"></div>
          <div className="absolute bottom-10 left-10 w-80 h-80 rounded-full bg-accent-500 blur-3xl"></div>
        </div>
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-primary-800/60 text-primary-200 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-primary-700">
              <span>🇯🇵</span>
              <span>Crafted in Japan · Loved in Korea</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
              Taste of Japan<br />
              <span className="text-accent-300">in Every Can</span>
            </h1>
            <p className="text-lg text-primary-200 mb-8 leading-relaxed">
              Premium sparkling cherry soda made with natural Hokkaido cherry extracts.
              Refreshing, bold, and authentically Japanese — now available across Asia.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="px-8 py-3 bg-accent-400 text-primary-950 font-bold rounded-full hover:bg-accent-300 transition text-center"
              >
                Open Account
              </Link>
              <a
                href="#flavors"
                className="px-8 py-3 border border-primary-600 text-primary-200 font-semibold rounded-full hover:bg-primary-800 transition text-center"
              >
                Explore Flavors
              </a>
            </div>
          </div>
          {/* Cherry decoration */}
          <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-1/2 flex items-center justify-center">
            <div className="text-[180px] leading-none opacity-20 select-none">🍒</div>
          </div>
        </div>
      </section>

      {/* Flavors */}
      <section id="flavors" className="py-20 bg-primary-50">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-primary-900 mb-3" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
            Our Signature Flavors
          </h2>
          <p className="text-center text-slate-500 mb-12">Three bold, sparkling cherry blends for every mood</p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Classic Cherry',
                jp: 'クラシックチェリー',
                desc: 'Pure Hokkaido cherry extract with a bold, sweet finish. The original that started it all.',
                color: 'from-primary-700 to-primary-900',
              },
              {
                name: 'Sakura Blend',
                jp: 'さくらブレンド',
                desc: 'Cherry meets delicate cherry blossom notes. Light, floral, perfectly balanced.',
                color: 'from-primary-500 to-primary-700',
              },
              {
                name: 'Yuzu Cherry',
                jp: 'ゆずチェリー',
                desc: 'A citrusy twist — tart yuzu and ripe cherry in one refreshing can.',
                color: 'from-primary-800 to-primary-950',
              },
            ].map(flavor => (
              <div key={flavor.name} className={`bg-gradient-to-br ${flavor.color} text-white rounded-2xl p-8 flex flex-col gap-3`}>
                <span className="text-4xl">🍒</span>
                <h3 className="text-xl font-bold" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
                  {flavor.name}
                </h3>
                <p className="text-primary-200 text-sm">{flavor.jp}</p>
                <p className="text-primary-100 text-sm leading-relaxed">{flavor.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Markets */}
      <section id="markets" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-primary-900 mb-4" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
                Japan & Korea
              </h2>
              <p className="text-slate-500 text-lg mb-6 leading-relaxed">
                Originally born in Hokkaido, Japan, チェリー quickly became a beloved drink in Korea&apos;s
                booming craft beverage scene. We now serve both markets with the same uncompromising quality.
              </p>
              <ul className="space-y-3">
                {[
                  { flag: '🇯🇵', label: 'Japan', detail: 'Available nationwide, including Hokkaido, Tokyo & Osaka' },
                  { flag: '🇰🇷', label: 'Korea', detail: 'Distributed in Seoul, Busan & major convenience chains' },
                ].map(m => (
                  <li key={m.label} className="flex items-start gap-3">
                    <span className="text-2xl">{m.flag}</span>
                    <div>
                      <p className="font-semibold text-slate-800">{m.label}</p>
                      <p className="text-sm text-slate-500">{m.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div id="about" className="bg-primary-50 rounded-2xl p-8 border border-primary-100">
              <h3 className="text-xl font-bold text-primary-900 mb-3" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
                Our Story
              </h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Founded in 2019 by a small team of beverage enthusiasts in Sapporo, チェリー started as a
                local craft soda sold at weekend markets. Word spread quickly — our unique cherry-forward taste
                resonated with a generation seeking bold, authentic flavors.
              </p>
              <p className="text-slate-600 leading-relaxed text-sm mt-3">
                Today we&apos;re proud to serve customers across Japan and Korea. Create your account to manage
                your subscription, track orders, and earn credits with every purchase.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-br from-primary-900 to-primary-950 text-white text-center">
        <div className="max-w-2xl mx-auto px-6">
          <p className="text-4xl mb-4">🍒</p>
          <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'M PLUS Rounded 1c, sans-serif' }}>
            Join チェリー Today
          </h2>
          <p className="text-primary-200 mb-8">
            Create your free account, earn credits, and enjoy Japan&apos;s finest cherry soda delivered to your door.
          </p>
          <Link
            href="/register"
            className="inline-block px-10 py-3 bg-accent-400 text-primary-950 font-bold rounded-full hover:bg-accent-300 transition"
          >
            Open Free Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary-950 text-primary-400 text-sm py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <Image src="/logo.svg" alt="チェリー" width={100} height={25} />
          <p>© 2026 チェリー. Crafted in Japan 🇯🇵</p>
        </div>
      </footer>
    </div>
  );
}
