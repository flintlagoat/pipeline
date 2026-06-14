import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server Supabase client (anon key + cookies) for server components and route handlers. Cookie
// writes from a Server Component throw (read-only) — the try/catch swallows that; the middleware
// is what actually refreshes the session cookies on each request.
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as never));
          } catch {
            // called from a Server Component — safe to ignore (middleware refreshes the session)
          }
        },
      },
    }
  );
}
