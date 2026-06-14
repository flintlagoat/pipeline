# Inkwell — website

Marketing + product site for Inkwell (Next.js 14 App Router + Tailwind + Supabase).

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Supabase setup (no terminal/CLI needed — all in the web dashboard)

1. **Keys** → Supabase dashboard → *Project Settings → API*. Copy the Project URL, the `anon`
   public key, and the `service_role` secret key. Then copy `.env.local.example` → `.env.local`
   and paste them in.
2. **Schema** → Supabase dashboard → *SQL Editor* → paste the contents of
   `supabase/migrations/0001_init.sql` and run it. That creates the `leads` table the waitlist
   form writes to (RLS on; only the server-side service role can read/write it).

The site builds and runs without Supabase configured — the waitlist API just accepts submissions
without storing them until the keys are present.

## Deploy

Vercel: import the repo, set the root directory to `website/`, add the three env vars from
`.env.local.example` in the Vercel project settings. (Supabase project ref: `lundkydfijkkqaaxrvrz`.)

## Structure

- `app/page.tsx` — the landing page (hero, problem, difference, how-it-works, features, pricing, waitlist).
- `app/api/waitlist/route.ts` — POST endpoint that stores leads via the service-role client.
- `components/WaitlistForm.tsx` — client form.
- `lib/supabaseAdmin.ts` — server-only Supabase client (null-safe before keys exist).
