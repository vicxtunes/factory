import { getClientSession } from "@/lib/auth/session";
import { fetchProductCatalog } from "@/lib/queries";

import { ClientShell } from "../shell";
import { ShowroomContent } from "../showroom-content";

export const metadata = { title: "Showroom — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ShowroomPage() {
  const [session, catalog] = await Promise.all([getClientSession(), fetchProductCatalog(true)]);

  return (
    <ClientShell signedIn={!!session} name={session?.name ?? null}>
      <ShowroomContent catalog={catalog} signedIn={!!session} />
    </ClientShell>
  );
}
