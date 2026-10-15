import { tokenRoute } from "@repo/lib/supabase/token-route";

// The access token for the browser's Supabase client (packages/lib/supabase/browser.ts).
export function GET() {
  return tokenRoute();
}
