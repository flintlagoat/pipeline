import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import GenerateVideo from '@/components/GenerateVideo';
import WatchButton from '@/components/WatchButton';

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

  const { data: channels } = await supabase
    .from('channels')
    .select('id,title,niche,archetype,created_at')
    .order('created_at', { ascending: false });
  const chs = (channels ?? []) as { id: string; title: string | null; niche: string | null; archetype: string | null; created_at: string }[];

  const { data: videos } = await supabase
    .from('videos')
    .select('id,title,topic,status,error,created_at')
    .order('created_at', { ascending: false });
  const vids = (videos ?? []) as { id: string; title: string | null; topic: string | null; status: string; error: string | null; created_at: string }[];

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
            <div className="mt-1 font-display text-4xl font-semibold text-white">{chs.length}</div>
            <div className="mt-1 text-sm text-slate-400">{chs.length ? 'Saved to your studio.' : 'Design your first channel look.'}</div>
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

        {chs.length > 0 && (
          <div className="mt-8 card p-6">
            <h2 className="text-lg font-semibold text-white">Your channels</h2>
            <div className="mt-4 divide-y divide-white/5">
              {chs.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium text-white">{c.title ?? 'Untitled channel'}</div>
                    <div className="text-sm text-slate-400">{c.niche}</div>
                  </div>
                  <span className="rounded-md border border-white/10 px-2 py-1 text-xs capitalize text-slate-400">
                    {(c.archetype ?? '').replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {chs.length > 0 && (
          <div className="mt-8">
            <GenerateVideo channels={chs.map((c) => ({ id: c.id, title: c.title }))} />
          </div>
        )}

        {vids.length > 0 && (
          <div className="mt-8 card p-6">
            <h2 className="text-lg font-semibold text-white">Your videos</h2>
            <div className="mt-4 divide-y divide-white/5">
              {vids.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">{v.topic || v.title || 'Untitled'}</div>
                    <div className="text-sm capitalize text-slate-500">{v.status}{v.error ? ` — ${v.error}` : ''}</div>
                  </div>
                  {v.status === 'ready' ? (
                    <WatchButton videoId={v.id} />
                  ) : (
                    <span className="rounded-md border border-white/10 px-2 py-1 text-xs capitalize text-slate-400">{v.status}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 card p-6">
          <h2 className="text-lg font-semibold text-white">Coming to your studio</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>· Auto-publish to YouTube on a schedule + analytics that improve every video</li>
            <li>· Buy more credits, or go local with the desktop app</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
