import { getClientSession } from "@repo/lib/auth/session";

import { ClientShell } from "../shell";
import { ClientSupportContent } from "../support-content";

export const metadata = { title: "Support" };
export const dynamic = "force-dynamic";

// Contact options for clients. Open to signed-out visitors too — someone who
// can't sign in is exactly who needs it.
export default async function SupportPage() {
  const session = await getClientSession();
  return (
    <ClientShell signedIn={!!session} name={session?.name ?? null} avatarUrl={session?.avatarUrl ?? null}>
      <ClientSupportContent />
    </ClientShell>
  );
}
