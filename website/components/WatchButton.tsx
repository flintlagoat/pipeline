'use client';

import { useState } from 'react';

export default function WatchButton({ videoId }: { videoId: string }) {
  const [busy, setBusy] = useState(false);
  async function watch() {
    setBusy(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/url`);
      const data = await res.json();
      if (res.ok && data.url) window.open(data.url, '_blank');
      else alert(data.error || 'Not available yet.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={watch}
      disabled={busy}
      className="rounded-md border border-white/10 px-3 py-1 text-xs text-slate-200 transition hover:border-white/30 disabled:opacity-50"
    >
      {busy ? '…' : 'Watch'}
    </button>
  );
}
