import * as http from 'http';
import { execFileSync } from 'child_process';
import {
  YT_SCOPES, AUTH_ENDPOINT, TOKEN_ENDPOINT, oauthClient, saveAuth, getMyChannel,
} from './youtubeClient';

// One-time OAuth2 handshake (loopback flow) for a channel. Run `npm run youtube:auth <channel>`
// once per channel during setup. Opens (or prints) the Google consent URL, captures the redirect
// on a local loopback port, exchanges the code for a refresh token, and saves it to
// channels/<id>/youtube.auth.json (gitignored).
//
// Google Cloud setup (one-time, done by the operator):
//   1. Create an OAuth 2.0 Client ID of type "Desktop app" (or "Web app").
//   2. Enable "YouTube Data API v3" + "YouTube Analytics API".
//   3. Add http://localhost:<port>/oauth2callback as an authorized redirect URI
//      (port defaults to 4180; override with OAUTH_REDIRECT_PORT).
//   4. Put GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.

const REDIRECT_PATH = '/oauth2callback';

function redirectPort(): number {
  return Number(process.env.OAUTH_REDIRECT_PORT) || 4180;
}

function redirectUri(): string {
  return `http://localhost:${redirectPort()}${REDIRECT_PATH}`;
}

function buildAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: YT_SCOPES.join(' '),
    access_type: 'offline',     // ask for a refresh token
    prompt: 'consent',          // force refresh_token issuance even on re-auth
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

function tryOpenBrowser(url: string): void {
  try {
    if (process.platform === 'win32') execFileSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
    else if (process.platform === 'darwin') execFileSync('open', [url], { stdio: 'ignore' });
    else execFileSync('xdg-open', [url], { stdio: 'ignore' });
  } catch {
    /* best-effort; the URL is printed regardless */
  }
}

/** Wait for the OAuth redirect on the loopback server and resolve with the authorization code. */
function waitForCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url || !req.url.startsWith(REDIRECT_PATH)) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const url = new URL(req.url, `http://localhost:${redirectPort()}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const state = url.searchParams.get('state');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (error || !code || state !== expectedState) {
        res.end('<h2>Authorization failed.</h2><p>You can close this tab and check the terminal.</p>');
        server.close();
        reject(new Error(error || (state !== expectedState ? 'state mismatch (possible CSRF)' : 'no code returned')));
        return;
      }
      res.end('<h2>✅ Authorized.</h2><p>You can close this tab and return to the terminal.</p>');
      server.close();
      resolve(code);
    });
    server.on('error', reject);
    server.listen(redirectPort());
  });
}

async function exchangeCodeForTokens(code: string): Promise<{ refresh_token: string; scope: string }> {
  const { clientId, clientSecret } = oauthClient();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Token exchange failed (${resp.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await resp.json()) as { refresh_token?: string; scope?: string };
  if (!json.refresh_token) {
    throw new Error(
      'No refresh_token returned. Revoke prior access at https://myaccount.google.com/permissions ' +
      'and re-run (the flow already requests access_type=offline + prompt=consent).'
    );
  }
  return { refresh_token: json.refresh_token, scope: json.scope ?? YT_SCOPES.join(' ') };
}

/** Run the full one-time OAuth handshake for a channel and persist the refresh token. */
export async function youtubeAuthFlow(channelId: string): Promise<void> {
  const { clientId } = oauthClient(); // throws early if .env not configured
  const state = Math.random().toString(36).slice(2);
  const authUrl = buildAuthUrl(clientId, state);

  console.log(`\n[youtube:auth] Authorizing channel "${channelId}".`);
  console.log(`  Redirect URI (must be authorized on your OAuth client): ${redirectUri()}`);
  console.log('  Opening your browser. If it does not open, paste this URL:\n');
  console.log(`    ${authUrl}\n`);

  const codePromise = waitForCode(state); // start listening BEFORE opening the browser
  tryOpenBrowser(authUrl);

  const code = await codePromise;
  const { refresh_token, scope } = await exchangeCodeForTokens(code);

  saveAuth({
    channelId,
    refresh_token,
    scope,
    obtained_at: new Date().toISOString(),
  });

  // Confirm by resolving the channel identity (also validates the token end-to-end).
  try {
    const me = await getMyChannel(channelId);
    saveAuth({ channelId, refresh_token, scope, obtained_at: new Date().toISOString(),
      youtube_channel_id: me.id, youtube_channel_title: me.title });
    console.log(`\n✅ Authorized "${me.title}" (${me.id}). Token saved → channels/${channelId}/youtube.auth.json`);
  } catch (e) {
    console.log(`\n✅ Refresh token saved → channels/${channelId}/youtube.auth.json`);
    console.warn(`  (Could not verify channel identity yet: ${(e as Error).message})`);
  }
}
