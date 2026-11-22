import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAmingDomain } from "@repo/lib/pro/core";
import { slugForDomain } from "@repo/lib/pro/server";
import { RESERVED_SLUGS } from "@repo/lib/studio-portal/core/rules";

// The client portal (client.<domain>) used to live under /client-side in the
// staff app. Links with that prefix still exist — marketing slides saved in
// the database, older push notifications, bookmarks — so send them to the
// same page at its new address.
// Also refreshes the client's Supabase Auth session cookie (they sign in with
// an emailed code — see app/actions.ts); pages read it with getClaims(),
// which can't write cookies, so the refresh has to happen here.
// (Next.js 16 renamed Middleware -> Proxy; runtime is nodejs.)

const LEGACY_BASE = "/client-side";

// A Pro business's own domain (owner, 2026-11-22): salon.com shows its page
// (amingspace.com/salon) and the pages under it, the address bar keeping
// salon.com. Aming's own pages (sign-in, My Business…) work there as usual.
// Looked up once a minute per domain; a domain not live, or whose Pro has
// ended, gets Aming's own site.
const DOMAIN_TTL_MS = 60_000;
/** This app's top-level pages besides the reserved addresses (app/*): never put under the business on its domain. */
const APP_PAGES = new Set(["agents", "alexis", "drive", "hero", "i", "notifications", "q", "r", "receipt", "~offline"]);
const domainCache = new Map<string, { slug: string | null; at: number }>();

async function slugOfHost(host: string): Promise<string | null> {
  if (!host.includes(".") || /^[\d.]+$/.test(host) || isAmingDomain(host) || host.endsWith(".github.dev") || host.endsWith(".githubpreview.dev")) return null;
  const hit = domainCache.get(host);
  if (hit && Date.now() - hit.at < DOMAIN_TTL_MS) return hit.slug;
  const slug = await slugForDomain(host).catch((err) => {
    console.error("own domain lookup failed:", host, err);
    return hit?.slug ?? null;
  });
  domainCache.set(host, { slug, at: Date.now() });
  return slug;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === LEGACY_BASE || pathname.startsWith(`${LEGACY_BASE}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(LEGACY_BASE.length) || "/";
    return NextResponse.redirect(url, 308);
  }

  // On a business's own domain: its page at the root, Aming's own pages as they are.
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const slug = await slugOfHost(host);
  const first = pathname.split("/")[1] ?? "";
  const rewriteTo = slug && first !== slug && !RESERVED_SLUGS.has(first) && !APP_PAGES.has(first) ? `/${slug}${pathname === "/" ? "" : pathname}` : null;

  const next = () => {
    if (!rewriteTo) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = rewriteTo;
    return NextResponse.rewrite(url, { request });
  };
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
