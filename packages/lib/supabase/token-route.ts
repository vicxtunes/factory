import { createClient } from "./server";

// GET /api/auth/token: the signed-in person's access token, for the browser
// client (./browser.ts). proxy.ts has already refreshed the session cookies
// on the way in, so this only reads them.
export async function tokenRoute(): Promise<Response> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const token = data?.claims ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
  return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
