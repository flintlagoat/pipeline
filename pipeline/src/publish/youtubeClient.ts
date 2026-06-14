import * as fs from 'fs';
import * as path from 'path';
import { channelDir } from '../config/paths';

// Low-level YouTube auth + REST client (Parts 1 & 2). Uses Google's OAuth2 + the YouTube Data v3
// and Analytics APIs over plain `fetch` (Node 18+/24 has global fetch) — no googleapis dependency.
// Per-channel refresh tokens live at channels/<id>/youtube.auth.json (gitignored).

// OAuth scopes: upload (videos.insert), readonly (channel/video reads), analytics readonly.
export const YT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

export interface YoutubeAuth {
  channelId: string;
  refresh_token: string;
  scope: string;
  obtained_at: string;
  // Cached identity, filled lazily after the first API call (informational only).
  youtube_channel_id?: string;
  youtube_channel_title?: string;
}

export function authPath(channelId: string): string {
  return path.join(channelDir(channelId), 'youtube.auth.json');
}

export function hasAuth(channelId: string): boolean {
  return fs.existsSync(authPath(channelId));
}

export function loadAuth(channelId: string): YoutubeAuth {
  const p = authPath(channelId);
  if (!fs.existsSync(p)) {
    throw new Error(
      `No YouTube auth for "${channelId}". Run: npm run youtube:auth ${channelId} (one-time).`
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as YoutubeAuth;
}

export function saveAuth(auth: YoutubeAuth): void {
  const p = authPath(auth.channelId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(auth, null, 2), 'utf8');
}

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

/** Read the OAuth client id/secret from env (loaded from .env). Throws with guidance if missing. */
export function oauthClient(): OAuthClient {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. Add them to .env (see .env.example) — ' +
      'create an OAuth "Desktop app" client in Google Cloud Console with the YouTube Data API v3 ' +
      'and YouTube Analytics API enabled.'
    );
  }
  return { clientId, clientSecret };
}

// ── Access token (short-lived) cache, per channel, in-process ──
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Exchange the channel's refresh token for a fresh access token (cached until ~1 min before expiry). */
export async function getAccessToken(channelId: string): Promise<string> {
  const cached = tokenCache.get(channelId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const { clientId, clientSecret } = oauthClient();
  const auth = loadAuth(channelId);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: auth.refresh_token,
    grant_type: 'refresh_token',
  });

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(
      `OAuth token refresh failed (${resp.status}). The refresh token may be revoked/expired — ` +
      `re-run npm run youtube:auth ${channelId}. ${detail.slice(0, 200)}`
    );
  }
  const json = (await resp.json()) as { access_token: string; expires_in: number };
  tokenCache.set(channelId, {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

/** Authenticated JSON GET against a googleapis endpoint. */
export async function apiGet<T = unknown>(
  channelId: string,
  url: string
): Promise<T> {
  const token = await getAccessToken(channelId);
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`YouTube API GET ${resp.status} ${resp.statusText} — ${detail.slice(0, 300)}`);
  }
  return (await resp.json()) as T;
}

/** Resolve and cache the authenticated user's uploads channel title/id (mine=true). */
export async function getMyChannel(channelId: string): Promise<{ id: string; title: string }> {
  const data = await apiGet<{ items?: { id: string; snippet: { title: string } }[] }>(
    channelId,
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true'
  );
  const item = data.items?.[0];
  if (!item) throw new Error('Could not resolve the authenticated YouTube channel (no items).');
  return { id: item.id, title: item.snippet.title };
}
