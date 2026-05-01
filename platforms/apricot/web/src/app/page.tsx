import Image from 'next/image';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5">
        <Image src="/logo.svg" alt="Абрикос UA" width={140} height={35} />
        <div className="flex gap-3">
          <Link
            href="/login"
            className="px-5 py-2 rounded-lg text-white border border-white/30 hover:bg-white/10 transition text-sm font-medium"
          >
            Увійти
          </Link>
          <Link
            href="/register"
            className="px-5 py-2 rounded-lg bg-accent-400 text-primary-900 hover:bg-accent-500 transition text-sm font-bold"
          >
            Зареєструватись
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-8 pt-20 pb-32 text-center">
        <div className="inline-block bg-accent-400/20 text-accent-400 text-sm font-semibold px-4 py-1.5 rounded-full mb-6 border border-accent-400/30">
          🇺🇦 Зроблено в Україні
        </div>
        <h1 className="font-heading text-5xl font-bold text-white mb-6 leading-tight">
          Платежі для<br />
          <span className="text-accent-400">сучасної України</span>
        </h1>
        <p className="text-primary-200 text-xl mb-10 max-w-2xl mx-auto">
          Поповнюй рахунок, переказуй кошти та керуй фінансами в одному місці. Швидко, надійно, безпечно.
        </p>
        <Link
          href="/register"
          className="inline-block px-8 py-4 bg-accent-400 text-primary-900 font-bold text-lg rounded-xl hover:bg-accent-500 transition shadow-lg"
        >
          Розпочати безкоштовно
        </Link>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-8 pb-20 grid grid-cols-3 gap-6">
        {[
          { icon: '⚡', title: 'Миттєві перекази', desc: 'Відправляй кошти іншим користувачам за секунди' },
          { icon: '🔒', title: 'Безпечно', desc: 'Захист транзакцій на рівні банківських стандартів' },
          { icon: '📱', title: 'Зручно', desc: 'Простий інтерфейс для щоденних фінансових операцій' },
        ].map(f => (
          <div key={f.title} className="bg-white/10 backdrop-blur rounded-xl p-6 text-white">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="font-heading font-bold text-lg mb-2">{f.title}</h3>
            <p className="text-primary-200 text-sm">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
