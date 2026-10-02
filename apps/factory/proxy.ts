import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// The staff app (factory.<domain>): /, /factory, /graphics, /dashboard,
// /display, /chat, /support. The client portal is its own app (apps/client);
// old /client-side links that still land here (bookmarks, shared links) are
// sent there.
// Also refreshes the Supabase Auth session cookie on dashboard requests —
// the only surface that signs in with Supabase Auth (email + password);
// workers and designers carry their own signed session cookies
// (see packages/lib/auth/cookies.ts) and don't need this.
// (Next.js 16 renamed Middleware -> Proxy; runtime is nodejs.)

const LEGACY_CLIENT_BASE = "/client-side";

const within = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

const needsSession = (pathname: string) => within(pathname, "/dashboard");

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const clientOrigin = process.env.NEXT_PUBLIC_CLIENT_ORIGIN;
  if (clientOrigin && within(pathname, LEGACY_CLIENT_BASE)) {
    const rest = pathname.slice(LEGACY_CLIENT_BASE.length) || "/";
    return NextResponse.redirect(new URL(`${rest}${search}`, clientOrigin));
  }

  const next = () => NextResponse.next({ request });

  let response = next();

  if (!needsSession(pathname)) return response;

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
          response = next();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the token when it is about to expire; verified locally, so no
  // round trip to Supabase Auth on every request (see getDashboardSession).
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  // Everything except Next internals, the service worker route and static
  // files (anything with a file extension: icons, manifest, images).
  matcher: ["/((?!_next|serwist|.*\\..*).*)"],
};
