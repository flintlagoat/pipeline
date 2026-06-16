'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-fetches the server component (video statuses, credits) on an interval while something is still
// rendering, then stops. Keeps the dashboard live without a manual refresh. Renders nothing.
export default function AutoRefresh({ active, intervalMs = 6000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
