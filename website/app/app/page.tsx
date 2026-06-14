import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Your studio — Inkwell' };

export default async function AppPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('email,credits').eq('id', user.id).single();
  const credits = profile?.credits ?? 0;
  const email = profile?.email ?? user.email;

  return (
    <main>
      <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/70 backdrop-blur-md">
        <nav className="container-x flex h-16 items-center justify-between">
          <a href="/" className="text-lg font-semibold tracking-tight text-white">Inkwell</a>
          <form action="/auth/signout" method="post">
            <button className="text-sm text-slate-400 transition hover:text-white">Sign out</button>
          </form>
        </nav>
      </header>

      <section className="container-x py-12 lg:py-16">
        <p className="text-sm text-slate-500">Signed in as {email}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">Your studio</h1>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="card p-6">
            <div className="text-xs uppercase tracking-wide text-slate-500">Credits</div>
            <div className="mt-1 font-display text-4xl font-semibold text-white">{credits}</div>
            <div className="mt-1 text-sm text-slate-400">Use credits to generate videos.</div>
          </div>
          <div className="card p-6">
            <div className="text-xs uppercase tracking-wide text-slate-500">Channels</div>
            <div className="mt-1 font-display text-4xl font-semibold text-white">0</div>
            <div className="mt-1 text-sm text-slate-400">Design your first channel look.</div>
          </div>
          <div className="card flex flex-col justify-between p-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Get started</div>
              <div className="mt-1 text-slate-300">Design a channel and see its look instantly.</div>
            </div>
            <a href="/demo" className="mt-4 rounded-xl bg-quill-500 px-5 py-2.5 text-center font-semibold text-white transition hover:bg-quill-400">
              Design a channel
            </a>
          </div>
        </div>

        <div className="mt-8 card p-6">
          <h2 className="text-lg font-semibold text-white">Coming to your studio</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>· Generate full videos from your channels (retention-engineered script + rendered animation)</li>
            <li>· Auto-publish on a schedule + analytics that improve every video</li>
            <li>· Buy credits or go local with the desktop app</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
