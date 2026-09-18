import { getClientSession } from "@/lib/auth/session";
import { fetchProductCatalog, fetchShowroomSettings } from "@/lib/queries";

import { ClientShell } from "../shell";
import { ShowroomContent } from "../showroom-content";

export const metadata = { title: "Showroom — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ShowroomPage() {
  const [session, catalog, showroomSettings] = await Promise.all([
    getClientSession(),
    fetchProductCatalog(true),
    fetchShowroomSettings(),
  ]);

  return (
    <ClientShell signedIn={!!session} name={session?.name ?? null}>
      <ShowroomContent catalog={catalog} signedIn={!!session} viewMode={showroomSettings.product_view_mode} />
    </ClientShell>
  );
}
