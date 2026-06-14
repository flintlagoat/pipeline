'use client';

import { useState, useEffect } from 'react';

type Spec = {
  title: string;
  niche: string;
  archetype: string;
  palette: { background: string; surface: string; textPrimary: string; textSecondary: string; accent1: string; accent2: string; money: string };
  typography: { display: string; body: string; mono: string; case: 'upper' | 'title' | 'none' };
  background: { mode: string; grain: number };
  assetStyle: string;
  voice: { tone: string; hookStyle: string };
  sample: { eyebrow: string; headline: string; emphasisWord: string; bigStat: string; statLabel: string; body: string };
};

function fontUrl(families: string[]): string {
  const qs = families
    .filter(Boolean)
    .map((f) => `family=${f.trim().replace(/\s+/g, '+')}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${qs}&display=swap`;
}
function applyCase(s: string, c: string): string {
  return c === 'upper' ? s.toUpperCase() : s;
}
function hexA(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function Headline({ text, word, accent, cas }: { text: string; word: string; accent: string; cas: string }) {
  const h = applyCase(text, cas);
  const w = applyCase(word || '', cas);
  const idx = w ? h.toLowerCase().indexOf(w.toLowerCase()) : -1;
  if (idx < 0) return <>{h}</>;
  return (
    <>
      {h.slice(0, idx)}
      <span style={{ color: accent }}>{h.slice(idx, idx + w.length)}</span>
      {h.slice(idx + w.length)}
    </>
  );
}

function LookPreview({ spec }: { spec: Spec }) {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontUrl([spec.typography.display, spec.typography.body, spec.typography.mono]);
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [spec]);

  const p = spec.palette;
  const grid = spec.background.mode === 'board_grid';
  const dotted = spec.background.mode === 'dotted';
  const bgImage = grid
    ? `linear-gradient(${hexA(p.textPrimary, 0.06)} 1px, transparent 1px), linear-gradient(90deg, ${hexA(p.textPrimary, 0.06)} 1px, transparent 1px)`
    : dotted
    ? `radial-gradient(${hexA(p.textSecondary, 0.18)} 1.2px, transparent 1.2px)`
    : 'none';
  const bgSize = grid ? '44px 44px' : dotted ? '26px 26px' : 'auto';

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10"
      style={{ background: p.background, fontFamily: `'${spec.typography.body}', sans-serif` }}
    >
      <div className="absolute inset-0" style={{ backgroundImage: bgImage, backgroundSize: bgSize }} />
      <div className="relative flex h-full flex-col justify-center gap-2 p-[6%]">
        <div
          className="text-[clamp(9px,1.6vw,15px)]"
          style={{ color: p.accent2, fontFamily: `'${spec.typography.mono}', monospace`, letterSpacing: '0.18em' }}
        >
          {applyCase(spec.sample.eyebrow, spec.typography.case)}
        </div>
        <div
          className="text-[clamp(22px,5.2vw,52px)] font-semibold"
          style={{ color: p.textPrimary, fontFamily: `'${spec.typography.display}', sans-serif`, lineHeight: 1.04 }}
        >
          <Headline text={spec.sample.headline} word={spec.sample.emphasisWord} accent={p.accent1} cas={spec.typography.case} />
        </div>
        <div className="mt-1 flex items-end gap-3">
          <div
            className="text-[clamp(28px,7vw,76px)] font-semibold"
            style={{ color: p.money, fontFamily: `'${spec.typography.display}', sans-serif`, lineHeight: 1 }}
          >
            {spec.sample.bigStat}
          </div>
          <div
            className="mb-2 text-[clamp(8px,1.4vw,13px)] uppercase tracking-widest"
            style={{ color: p.textSecondary, fontFamily: `'${spec.typography.mono}', monospace` }}
          >
            {spec.sample.statLabel}
          </div>
        </div>
        <div className="max-w-[72%] text-[clamp(10px,1.7vw,16px)]" style={{ color: p.textSecondary }}>
          {spec.sample.body}
        </div>
      </div>
    </div>
  );
}

export default function ChannelDemo() {
  const [idea, setIdea] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [spec, setSpec] = useState<Spec | null>(null);
  const [err, setErr] = useState('');

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (idea.trim().length < 4) return;
    setStatus('loading');
    setErr('');
    try {
      const res = await fetch('/api/demo/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSpec(data.spec as Spec);
      setStatus('done');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setStatus('error');
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={generate} className="card p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. the hidden economics of everyday businesses"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-900/70 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-quill-500"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="rounded-xl bg-quill-500 px-6 py-3 font-semibold text-white transition hover:bg-quill-400 disabled:opacity-60"
          >
            {status === 'loading' ? 'Designing…' : 'Generate my channel'}
          </button>
        </div>
        {status === 'error' && <p className="mt-2 px-1 text-sm text-rose-400">{err}</p>}
        <p className="mt-2 px-1 text-xs text-slate-500">Free preview — generates your channel&apos;s look + a sample frame in seconds.</p>
      </form>

      {status === 'loading' && (
        <div className="card flex aspect-video w-full items-center justify-center text-slate-500">Designing your channel…</div>
      )}

      {spec && status === 'done' && (
        <div className="space-y-6">
          <LookPreview spec={spec} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Channel</div>
              <div className="mt-1 font-medium text-white">{spec.title}</div>
              <div className="text-sm text-slate-400">{spec.niche}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Style</div>
              <div className="mt-1 font-medium capitalize text-white">{spec.archetype.replace(/_/g, ' ')}</div>
              <div className="text-sm capitalize text-slate-400">{spec.typography.display} · {spec.assetStyle.replace(/-/g, ' ')}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Palette</div>
              <div className="mt-2 flex gap-2">
                {[spec.palette.background, spec.palette.accent1, spec.palette.accent2, spec.palette.money, spec.palette.textPrimary].map((c, i) => (
                  <span key={i} title={c} className="h-7 w-7 rounded-md border border-white/15" style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-quill-500/40 bg-quill-500/10 p-6 text-center">
            <p className="text-lg font-medium text-white">This is just the look. Inkwell makes the whole video.</p>
            <p className="mt-1 text-sm text-slate-400">Retention-engineered script, rendered animation, voiceover — auto-published on a schedule.</p>
            <a href="/#waitlist" className="mt-4 inline-block rounded-xl bg-quill-500 px-6 py-3 font-semibold text-white transition hover:bg-quill-400">
              Get my first video free
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
