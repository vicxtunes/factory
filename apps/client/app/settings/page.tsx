import { redirect } from "next/navigation";

import { PanelStackSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { getClientSession } from "@repo/lib/auth/session";

import { ClientShell } from "../shell";
import { PinSettings } from "../pin-settings";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function ClientSettingsPage() {
  const session = await getClientSession();
  if (!session) redirect("/");

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <Loading skeleton={<PanelStackSkeleton count={1} />}>
        <Pin clientId={session.client_id} />
      </Loading>
    </ClientShell>
  );
}

async function Pin({ clientId }: { clientId: string }) {
  const { data: cred } = await createAdminClient()
    .from("client_credentials")
    .select("client_id")
    .eq("client_id", clientId)
    .maybeSingle();
  return <PinSettings hasPin={!!cred} />;
}
