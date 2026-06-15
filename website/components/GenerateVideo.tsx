'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function GenerateVideo({ channels }: { channels: { id: string; title: string | null }[] }) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function go() {
    if (!channelId || topic.trim().length < 4) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/videos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setTopic('');
      setMsg(
        data.configured
          ? 'Queued — your video is rendering. It will appear below in a few minutes (refresh to update).'
          : 'Queued. The render worker isn’t connected yet; it will start once configured.'
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-white">Generate a video</h2>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="rounded-xl border border-white/10 bg-ink-900/70 px-3 py-3 text-slate-200 outline-none focus:border-quill-500"
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title ?? 'Untitled'}
            </option>
          ))}
        </select>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Video topic — e.g. why gyms oversell memberships"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-900/70 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-quill-500"
        />
        <button
          onClick={go}
          disabled={busy}
          className="rounded-xl bg-quill-500 px-6 py-3 font-semibold text-white transition hover:bg-quill-400 disabled:opacity-60"
        >
          {busy ? 'Queuing…' : 'Generate (1 credit)'}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-slate-400">{msg}</p>}
    </div>
  );
}
