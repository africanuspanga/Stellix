import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client for Server Components, Server Functions and
 * Route Handlers. Still anon-key + user session: RLS applies. The service-role
 * key is reserved for platform-owner jobs and must never reach this path.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — session refresh is handled
            // by the auth proxy/middleware layer (Sprint 1).
          }
        },
      },
    },
  );
}
