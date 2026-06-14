'use client';

import { useState } from 'react';

type Status = 'idle' | 'loading' | 'ok' | 'error';

export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Creator');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setStatus('ok');
      setMessage("You're on the list. We'll email you when your free generation is ready.");
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  if (status === 'ok') {
    return (
      <div className="card p-6 text-center">
        <p className="text-lg font-medium text-white">Thanks — you&apos;re in.</p>
        <p className="mt-2 text-sm text-slate-400">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-900/70 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-quill-500"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-xl border border-white/10 bg-ink-900/70 px-4 py-3 text-slate-200 outline-none focus:border-quill-500"
        >
          <option>Creator</option>
          <option>Agency</option>
          <option>Just curious</option>
        </select>
        <button
          type="submit"
          disabled={status === 'loading'}
          className="rounded-xl bg-quill-500 px-6 py-3 font-semibold text-white transition hover:bg-quill-400 disabled:opacity-60"
        >
          {status === 'loading' ? 'Joining…' : 'Get free access'}
        </button>
      </div>
      {status === 'error' && <p className="mt-2 px-1 text-sm text-rose-400">{message}</p>}
      <p className="mt-2 px-1 text-xs text-slate-500">
        Free first video, no card required. We&apos;ll never sell your email.
      </p>
    </form>
  );
}
