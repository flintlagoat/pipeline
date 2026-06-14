'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // auto-confirm is on, so sign in immediately to establish a session
        const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
        if (e2) throw e2;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push('/app');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container-x flex min-h-screen flex-col items-center justify-center py-16">
      <a href="/" className="mb-8 text-lg font-semibold tracking-tight text-white">Inkwell</a>
      <div className="card w-full max-w-md p-8">
        <h1 className="font-display text-2xl font-semibold text-white">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {mode === 'signup' ? 'Start free — your first videos are on us.' : 'Sign in to your studio.'}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full rounded-xl border border-white/10 bg-ink-900/70 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-quill-500"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (8+ characters)"
            className="w-full rounded-xl border border-white/10 bg-ink-900/70 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-quill-500"
          />
          {err && <p className="text-sm text-rose-400">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-quill-500 px-6 py-3 font-semibold text-white transition hover:bg-quill-400 disabled:opacity-60"
          >
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button
          onClick={() => {
            setMode(mode === 'signup' ? 'login' : 'signup');
            setErr('');
          }}
          className="mt-4 w-full text-center text-sm text-slate-400 transition hover:text-white"
        >
          {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </div>
    </main>
  );
}
