import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// The client portal (client.<domain>) used to live under /client-side in the
// staff app. Links with that prefix still exist — marketing slides saved in
// the database, older push notifications, bookmarks — so send them to the
// same page at its new address.
// Also refreshes the client's Supabase Auth session cookie (they sign in with
// an emailed code — see app/actions.ts); pages read it with getClaims(),
// which can't write cookies, so the refresh has to happen here.
// (Next.js 16 renamed Middleware -> Proxy; runtime is nodejs.)

const LEGACY_BASE = "/client-side";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === LEGACY_BASE || pathname.startsWith(`${LEGACY_BASE}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(LEGACY_BASE.length) || "/";
    return NextResponse.redirect(url, 308);
  }

  const next = () => NextResponse.next({ request });
  let response = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = next();
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Refreshes the token when it is about to expire; verified locally.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  // Everything except Next internals, the service worker route and static
  // files (anything with a file extension: icons, manifest, images).
  matcher: ["/((?!_next|serwist|.*\\..*).*)"],
};
