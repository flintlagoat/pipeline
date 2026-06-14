import ChannelDemo from '@/components/ChannelDemo';

export const metadata = {
  title: 'Try Inkwell — design your channel free',
  description: 'Describe your channel idea and instantly see its one-of-a-kind look and a sample frame.',
};

export default function DemoPage() {
  return (
    <main>
      <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/70 backdrop-blur-md">
        <nav className="container-x flex h-16 items-center justify-between">
          <a href="/" className="text-lg font-semibold tracking-tight text-white">Inkwell</a>
          <a href="/#pricing" className="text-sm text-slate-400 transition hover:text-white">Pricing</a>
        </nav>
      </header>

      <section className="container-x py-16 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-quill-500/30 bg-quill-500/10 px-3 py-1 text-xs font-medium text-quill-400">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
            Free preview · no signup
          </span>
          <h1 className="mt-6 font-display text-4xl font-semibold text-white sm:text-5xl">Design your channel, free</h1>
          <p className="mt-4 text-lg text-slate-400">
            Describe your idea. Inkwell designs a one-of-a-kind channel look and writes a sample frame in its
            voice — instantly. No two channels look alike.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-4xl">
          <ChannelDemo />
        </div>
      </section>
    </main>
  );
}
