import { getClientSession } from "@/lib/auth/session";
import { fetchCurrencies, fetchProductCatalog, fetchShowroomSettings } from "@/lib/queries";

import { ClientShell } from "../shell";
import { ShowroomContent } from "../showroom-content";

export const metadata = { title: "Showroom — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ShowroomPage() {
  const [session, catalog, showroomSettings, currencies] = await Promise.all([
    getClientSession(),
    fetchProductCatalog(true),
    fetchShowroomSettings(),
    fetchCurrencies(true),
  ]);

  return (
    <ClientShell signedIn={!!session} name={session?.name ?? null}>
      <ShowroomContent
        catalog={catalog}
        signedIn={!!session}
        viewMode={showroomSettings.product_view_mode}
        showPrices={showroomSettings.show_prices}
        currencies={currencies}
      />
    </ClientShell>
  );
}
