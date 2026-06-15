import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://inkwell.studio').replace(/\/$/, '');
  const now = new Date();
  return ['', '/demo', '/login'].map((p) => ({ url: `${base}${p}`, lastModified: now }));
}
