import { redirect } from "next/navigation";

import { AlexisFullPage } from "@repo/ui/assistant/Alexis";
import { getClientSession } from "@repo/lib/auth/session";

import { cancelAlexis, confirmAlexis } from "../alexis-actions";
import { ClientShell } from "../shell";

export const metadata = { title: "Alexis" };
export const dynamic = "force-dynamic";

// Alexis's own page: every chat, and the welcome (packages/ui/assistant/AlexisPage.tsx).
export default async function AlexisPage() {
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");
  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <AlexisFullPage actions={{ confirm: confirmAlexis, cancel: cancelAlexis }} path="/alexis" />
    </ClientShell>
  );
}
