import { getClientSession } from "@/lib/auth/session";
import { fetchCurrencies, fetchProductCatalog, fetchShowroomSettings } from "@/lib/queries";

import { ClientShell } from "./shell";
import { ShowroomContent } from "./showroom-content";

// The public showroom — no login needed. Rendered at /client-side/showroom and
// as the front door (/client-side) for signed-out visitors.
export async function ShowroomView() {
  const [session, catalog, showroomSettings, currencies] = await Promise.all([
    getClientSession(),
    fetchProductCatalog(true),
    fetchShowroomSettings(),
    fetchCurrencies(true),
  ]);

  return (
    <ClientShell signedIn={!!session} name={session?.name ?? null} avatarUrl={session?.avatarUrl ?? null}>
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
