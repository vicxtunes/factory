import { NextResponse, type NextRequest } from "next/server";

// The client portal (client.<domain>) used to live under /client-side in the
// staff app. Links with that prefix still exist — marketing slides saved in
// the database, older push notifications, bookmarks — so send them to the
// same page at its new address.
// (Next.js 16 renamed Middleware -> Proxy; runtime is nodejs.)

const LEGACY_BASE = "/client-side";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = url.pathname.slice(LEGACY_BASE.length) || "/";
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/client-side", "/client-side/:path*"],
};
