import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// OAuth (PKCE) landing point for "Continue with Google". Supabase redirects
// here with ?code=…; exchanging it sets the session cookies, then we send the
// user back to the client portal, which decides whether they still need to
// link a phone number (see app/client-side/google-setup-form.tsx).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Only ever redirect to a same-site path — never an attacker-supplied URL.
  const next = searchParams.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/client-side";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${target}`);
  }
  return NextResponse.redirect(`${origin}/client-side?auth_error=1`);
}
