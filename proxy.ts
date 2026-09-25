import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Two subdomains, one app (see Notion: "Aming Ltd - Multi-Subdomain Routing
// Architecture"):
//   factory.<domain> -> staff surfaces (/, /factory, /graphics, /dashboard, /display)
//   client.<domain> -> the client portal, served from /client-side but shown
//                       at the root (client.<domain>/orders, not /client-side/orders)
// Any other host (localhost, Codespaces, previews, the apex domain) is left
// untouched, so local dev keeps the original path-based URLs.
// Also refreshes the Supabase Auth session cookie on dashboard requests —
// the only surface that signs in with Supabase Auth (email + password);
// workers, designers and clients carry their own signed session cookies
// (see lib/auth/cookies.ts) and don't need this.
// (Next.js 16 renamed Middleware -> Proxy; runtime is nodejs.)

const FACTORY_HOST = /^factory\./i;
const CLIENT_HOST = /^client\./i;

const STAFF_PATHS = ["/factory", "/graphics", "/dashboard", "/display"];
// Served from the same public path on every host.
const SHARED_PATHS = ["/support", "/chat", "/auth", "/api", "/~offline", "/serwist"];
const CLIENT_BASE = "/client-side";

const within = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

const needsSession = (pathname: string) => within(pathname, "/dashboard");

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? request.nextUrl.host;

  let internalPath = pathname;
  let rewriteTo: URL | null = null;

  if (CLIENT_HOST.test(host)) {
    if (STAFF_PATHS.some((p) => within(pathname, p))) {
      // Staff tools live on the factory subdomain.
      const url = request.nextUrl.clone();
      url.host = host.replace(CLIENT_HOST, "factory.");
      return NextResponse.redirect(url);
    }
    if (within(pathname, CLIENT_BASE)) {
      // Hard-coded /client-side links (and push-notification URLs) -> clean URL.
      const url = request.nextUrl.clone();
      url.pathname = pathname.slice(CLIENT_BASE.length) || "/";
      return NextResponse.redirect(url);
    }
    if (!SHARED_PATHS.some((p) => within(pathname, p))) {
      internalPath = pathname === "/" ? CLIENT_BASE : `${CLIENT_BASE}${pathname}`;
      rewriteTo = request.nextUrl.clone();
      rewriteTo.pathname = internalPath;
    }
  } else if (FACTORY_HOST.test(host) && within(pathname, CLIENT_BASE)) {
    const url = request.nextUrl.clone();
    url.host = host.replace(FACTORY_HOST, "client.");
    url.pathname = pathname.slice(CLIENT_BASE.length) || "/";
    return NextResponse.redirect(url);
  }

  const next = () =>
    rewriteTo
      ? NextResponse.rewrite(rewriteTo, { request })
      : NextResponse.next({ request });

  let response = next();

  if (!needsSession(internalPath)) return response;

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

  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Everything except Next internals, the service worker route and static
  // files (anything with a file extension: icons, manifest, images).
  matcher: ["/((?!_next|serwist|.*\\..*).*)"],
};
