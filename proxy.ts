import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase Auth session cookie. Every signed-in surface now
// rides on a Supabase session (staff email+password, everyone else Google), and
// the access token lasts an hour: server components can't write cookies, so
// this is the only place a refreshed token gets saved. A route missing from the
// matcher below would be signed out after about an hour.
// (Next.js 16 renamed Middleware -> Proxy; runtime is nodejs.)
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/client-side/:path*",
    "/factory/:path*",
    "/graphics/:path*",
    "/support/:path*",
    "/api/:path*",
  ],
};
