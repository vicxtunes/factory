import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Anon client bound to the request cookies. Used for Supabase Auth
// (supervisor / boss sessions) on the dashboard. Not used for writes.
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
            // Called from a Server Component — safe to ignore when proxy.ts
            // is refreshing the session.
          }
        },
      },
    },
  );
}
