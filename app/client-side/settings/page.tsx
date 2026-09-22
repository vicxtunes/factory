import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { getClientSession } from "@/lib/auth/session";

import { ClientShell } from "../shell";
import { PinSettings } from "../pin-settings";

export const metadata = { title: "Settings — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ClientSettingsPage() {
  const session = await getClientSession();
  if (!session) redirect("/client-side");

  const admin = createAdminClient();
  const { data: cred } = await admin
    .from("client_credentials")
    .select("client_id")
    .eq("client_id", session.client_id)
    .maybeSingle();

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <PinSettings hasPin={!!cred} />
    </ClientShell>
  );
}
