import WaitlistForm from '@/components/WaitlistForm';

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="28" height="28" rx="8" fill="#6d6df0" fillOpacity="0.16" stroke="#6d6df0" strokeOpacity="0.5" />
        <path d="M11 22V10m0 12c5.5 0 5.5-7 10-7m-10-5c4 0 4 4 8 4" stroke="#e8b84b" strokeWidth="2" strokeLinecap="round" />
        <circle cx="22" cy="11" r="2.4" fill="#e8b84b" />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-white">Inkwell</span>
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/70 backdrop-blur-md">
      <nav className="container-x flex h-16 items-center justify-between">
        <Logo />
        <div className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
          <a href="#problem" className="transition hover:text-white">The problem</a>
          <a href="#how" className="transition hover:text-white">How it works</a>
          <a href="#features" className="transition hover:text-white">Features</a>
          <a href="#pricing" className="transition hover:text-white">Pricing</a>
          <a href="/login" className="transition hover:text-white">Sign in</a>
        </div>
        <a href="/demo" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-slate-200">
          Try free
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="container-x relative grid gap-14 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-quill-500/30 bg-quill-500/10 px-3 py-1 text-xs font-medium text-quill-400">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
            Built for the post-2025 &ldquo;inauthentic content&rdquo; era
          </span>
          <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.08] text-white sm:text-5xl lg:text-6xl">
            Most AI video tools make the slop YouTube now{' '}
            <span className="text-gradient">demonetizes.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
            Inkwell builds long-form faceless videos with{' '}
            <span className="text-slate-200">custom-rendered animation</span> and{' '}
            <span className="text-slate-200">retention-engineered scripts</span> — a different look for
            every channel, designed to be watched, not skipped. You set up a channel. It does the rest.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href="/demo" className="rounded-xl bg-quill-500 px-6 py-3.5 font-semibold text-white transition hover:bg-quill-400">
              Generate a free video
            </a>
            <a href="#how" className="rounded-xl border border-white/15 px-6 py-3.5 font-semibold text-slate-200 transition hover:border-white/30 hover:text-white">
              See how it works
            </a>
          </div>
          <p className="mt-5 text-sm text-slate-500">No card required · First video on us · Cancel anytime</p>
        </div>

        <div className="relative">
          <BoardMock />
        </div>
      </div>
    </section>
  );
}

function BoardMock() {
  return (
    <div className="card relative aspect-video overflow-hidden p-0">
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="relative flex h-full flex-col justify-between p-7">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-quill-400">How industries work</div>
        <div>
          <div className="font-display text-5xl font-semibold leading-none text-white">
            $3,000<span className="text-gold-400">/mo</span>
          </div>
          <div className="mt-3 h-px w-40 bg-gradient-to-r from-quill-500 to-transparent" />
          <p className="mt-3 max-w-[18rem] text-sm text-slate-400">
            The vending machine in your lobby isn&apos;t selling soda. It&apos;s selling <span className="text-white">real estate.</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <svg width="58" height="40" viewBox="0 0 58 40" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="34" height="36" rx="3" stroke="#8b8bf5" strokeWidth="1.5" />
            <line x1="8" y1="9" x2="30" y2="9" stroke="#8b8bf5" strokeWidth="1.2" />
            <rect x="8" y="14" width="22" height="14" rx="1.5" stroke="#e8b84b" strokeWidth="1.2" />
            <line x1="42" y1="20" x2="56" y2="20" stroke="#8b8bf5" strokeWidth="1.5" strokeDasharray="3 3" />
          </svg>
          <span className="rounded-md border border-gold-400/30 bg-gold-400/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-gold-300">
            margin: 70%
          </span>
        </div>
      </div>
    </div>
  );
}

function Problem() {
  const points = [
    {
      title: 'Template slop gets caught',
      body: 'YouTube’s July 2025 policy demonetizes content that’s "mass-produced, repetitive, or a template with little variation." That’s exactly what stock-footage AI tools produce.',
    },
    {
      title: 'Stock footage ≠ original',
      body: 'The same B-roll and robotic narration over recycled facts reads as low-effort to both viewers and the algorithm. Retention collapses in the first 30 seconds.',
    },
    {
      title: 'Same channel, every video',
      body: 'Identical structure and timestamps every upload trains viewers to predict — and skip. People catch onto patterns fast.',
    },
  ];
  return (
    <section id="problem" className="border-t border-white/5 py-20 lg:py-28">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-400">The reckoning</p>
          <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
            Faceless channels are getting demonetized at scale
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            The entire &ldquo;YouTube automation&rdquo; category was built on a trapdoor that already opened.
            The tools flooding the market make the precise thing the platform is now punishing.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {points.map((p) => (
            <div key={p.title} className="card p-6">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-400/10 text-rose-400">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Difference() {
  return (
    <section className="border-t border-white/5 py-20 lg:py-28">
      <div className="container-x grid items-center gap-14 lg:grid-cols-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-quill-400">The Inkwell difference</p>
          <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
            We make the one thing the slop can&apos;t: original.
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Inkwell renders its own animation frame by frame — wireframe schematics, data reveals, typed
            headlines synced to the voiceover. No stock clips. No two channels look alike. Every script is
            built on a retention spine and grounded in real analysis.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              'Custom-rendered visuals, not stock footage or AI video',
              'Retention architecture: hooks, open loops, held payoffs',
              'A distinct visual identity generated per channel',
              'Learns from your own analytics and improves',
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0" aria-hidden="true">
                  <circle cx="12" cy="12" r="11" fill="#6d6df0" fillOpacity="0.15" />
                  <path d="m7.5 12.5 3 3 6-7" stroke="#8b8bf5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-slate-300">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <Quadrant />
      </div>
    </section>
  );
}

function Quadrant() {
  return (
    <div className="card p-6">
      <div className="relative h-[340px] w-full">
        <div className="absolute inset-x-10 inset-y-6 rounded-xl border border-white/10" />
        <div className="absolute inset-x-10 top-1/2 h-px bg-white/10" />
        <div className="absolute inset-y-6 left-1/2 w-px bg-white/10" />

        <div className="absolute right-12 top-9 w-40 rounded-lg border border-quill-500/40 bg-quill-500/15 p-3 text-right">
          <div className="text-sm font-semibold text-white">Inkwell</div>
          <div className="text-xs text-quill-300">long-form · rendered · engineered</div>
        </div>

        <span className="absolute left-12 bottom-16 text-xs text-slate-500">AutoShorts</span>
        <span className="absolute left-24 bottom-9 text-xs text-slate-500">Faceless.so</span>
        <span className="absolute left-1/2 bottom-12 -translate-x-1/2 text-xs text-slate-500">Pictory</span>
        <span className="absolute right-16 bottom-10 text-xs text-slate-500">HeyGen</span>

        <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[11px] text-slate-400">distinct &amp; engineered</span>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[11px] text-slate-500">templated slop</span>
        <span className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-[11px] text-slate-500">short-form</span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2 rotate-90 text-[11px] text-slate-500">long-form</span>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">Where the market sits — and the corner everyone left empty.</p>
    </div>
  );
}

function How() {
  const steps = [
    { n: '01', title: 'Design your channel’s vibe', body: 'Name it and describe it. Inkwell generates a complete, one-of-a-kind look: palette, typography, motion, voice — never a default template.' },
    { n: '02', title: 'It finds proven demand', body: 'Inkwell researches outlier videos in your niche and designs a packaged title + thumbnail + hook before a word is written.' },
    { n: '03', title: 'Script + render + voice', body: 'A retention-architected script, fact-checked, then rendered as original animation with a natural AI voiceover (or record your own).' },
    { n: '04', title: 'Publish on autopilot', body: 'Schedule uploads, pull your analytics, and let the system learn what works — improving every future video.' },
  ];
  return (
    <section id="how" className="border-t border-white/5 py-20 lg:py-28">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-quill-400">How it works</p>
          <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
            You set up a channel. Inkwell runs the studio.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="card p-6">
              <div className="font-display text-3xl font-semibold text-quill-500/70">{s.n}</div>
              <h3 className="mt-3 text-lg font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { title: 'Rendered, not stitched', body: 'Every frame is drawn by the engine — wireframe assets, animated diagrams, count-up numbers, typed reveals synced to narration.' },
    { title: 'Retention engineering', body: 'Three-job hooks in 15s, open loops, re-hooks every 30–45s, payoff held to the final third. Built in, not bolted on.' },
    { title: 'A look per channel', body: 'A deterministic signature means even same-niche channels never render identically — the anti-fingerprint moat.' },
    { title: 'Proven-demand topics', body: 'Outlier research surfaces what’s actually over-performing in your niche, so you ride demand instead of guessing.' },
    { title: 'Self-improving loop', body: 'It reads your retention curves, attributes drop-off to the exact on-screen beat, and conditions the next script on what worked.' },
    { title: 'Own it or stream it', body: 'Run it in the cloud, or buy the local app and render on your own machine with your own keys. Your studio, your call.' },
  ];
  return (
    <section id="features" className="border-t border-white/5 py-20 lg:py-28">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-400">Under the hood</p>
          <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
            An actual studio, not a wrapper around stock clips
          </h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.title} className="card p-6">
              <h3 className="text-lg font-semibold text-white">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const tiers = [
    {
      name: 'Free',
      price: '$0',
      cadence: 'one video',
      blurb: 'See the power. Generate a short video in the cloud, watermarked.',
      cta: 'Start free',
      featured: false,
      perks: ['1 cloud-rendered video', 'Full retention-engineered script', 'Channel look generator', 'Watermarked export'],
    },
    {
      name: 'Cloud Creator',
      price: '$59',
      cadence: 'per month',
      blurb: 'Hosted, hands-off. Everything runs in the cloud, including auto-upload.',
      cta: 'Join the waitlist',
      featured: true,
      perks: ['Credit-based generation', 'Auto-publish + scheduler', 'Self-improving analytics loop', 'Up to 3 channels', 'No install, no API keys'],
    },
    {
      name: 'Studio (local)',
      price: '$499',
      cadence: 'one-time + $29/mo',
      blurb: 'Own the app. Render free on your machine; auto-pilot stays subscription.',
      cta: 'Join the waitlist',
      featured: false,
      perks: ['Desktop app, bring your own keys', 'Unlimited local renders', 'Auto-upload + analytics add-on', 'Multi-channel', 'Priority support'],
    },
  ];
  return (
    <section id="pricing" className="border-t border-white/5 py-20 lg:py-28">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-quill-400">Pricing</p>
          <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
            Start free. Scale when it&apos;s working.
          </h2>
          <p className="mt-4 text-slate-400">Launch pricing — locked in for early members. Final tiers may shift.</p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`card relative flex flex-col p-7 ${t.featured ? 'border-quill-500/50 ring-1 ring-quill-500/40' : ''}`}
            >
              {t.featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-quill-500 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-white">{t.name}</h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-4xl font-semibold text-white">{t.price}</span>
                <span className="text-sm text-slate-500">{t.cadence}</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">{t.blurb}</p>
              <ul className="mt-6 space-y-3 text-sm">
                {t.perks.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-slate-300">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0" aria-hidden="true">
                      <path d="m6 12.5 3.5 3.5 8.5-9" stroke="#8b8bf5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
              <a
                href="#waitlist"
                className={`mt-7 rounded-xl px-5 py-3 text-center font-semibold transition ${
                  t.featured ? 'bg-quill-500 text-white hover:bg-quill-400' : 'border border-white/15 text-slate-200 hover:border-white/30 hover:text-white'
                }`}
              >
                {t.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WaitlistCTA() {
  return (
    <section id="waitlist" className="border-t border-white/5 py-20 lg:py-28">
      <div className="container-x">
        <div className="card relative overflow-hidden p-8 sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">
              Get your first video free
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              Join the early-access list. We&apos;ll spin up a channel look and render you a video so you can
              see the difference for yourself.
            </p>
            <div className="mx-auto mt-8 max-w-xl text-left">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-12">
      <div className="container-x flex flex-col items-center justify-between gap-6 sm:flex-row">
        <Logo />
        <p className="max-w-md text-center text-xs leading-relaxed text-slate-500 sm:text-right">
          Inkwell is a video production tool. It does not guarantee views, revenue, or income — results
          depend on your topics, niche, and effort. © {new Date().getFullYear()} Inkwell.
        </p>
      </div>
    </footer>
  );
}

export default function Page() {
  return (
    <main>
      <Nav />
      <Hero />
      <Problem />
      <Difference />
      <How />
      <Features />
      <Pricing />
      <WaitlistCTA />
      <Footer />
    </main>
  );
}
