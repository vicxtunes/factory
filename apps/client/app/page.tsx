import { redirect } from "next/navigation";

import { BannerSkeleton, ChartsSkeleton, ChipRowSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { OwingBanner } from "@repo/ui/invoices/OwingBanner";
import { WalletSummaryCard } from "@repo/ui/wallet/WalletSummaryCard";
import { getClientSession } from "@repo/lib/auth/session";
import { getMyOwing } from "@repo/lib/invoices/actions";
import { isOptionCategory } from "@repo/lib/catalog-options";
import { fetchClientItems, fetchMarketingSlides, fetchProductCatalog, fetchShowroomSettings } from "@repo/lib/queries";
import type { ProductCategory } from "@repo/lib/types";
import { agentOfClient } from "@repo/lib/agents/server";
import { vendors } from "@repo/lib/vendors/server";
import { getMyWalletSummary } from "@repo/lib/wallet/actions";

import { clientMoney } from "@repo/lib/currency/server";
import { ClientDashboard } from "./dashboard";
import { DealsWelcome, type Deal } from "./deals-slider";
import { Landing } from "./landing";
import { rememberedClient } from "./remembered-device";
import { ClientShell } from "./shell";
import { SignInOverlay } from "./sign-in-overlay";


export default async function ClientSidePage({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  const session = await getClientSession();

  if (!session) {
    // Signed-out visitors land on Aming Space's landing page (the showroom is
    // for signed-in studios); the sign-in form only shows when asked
    // for (?signin=1, e.g. from the topbar's Log in link) — or straight away
    // on a browser that remembers its account: the lock screen.
    const params = await searchParams;
    if (!params.signin && !(await rememberedClient())) return <Landing />;
    return <SignInOverlay behind={<Landing />} />;
  }

  // A vendor's account opens on its vendor side.
  if (await vendors.mine(session.client_id)) redirect("/vendors");
  if (await agentOfClient(session.client_id)) redirect("/agents");

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <Loading
        skeleton={
          // Quick actions, marketing banner, summary tiles and charts.
          <div className="space-y-6">
            <ChipRowSkeleton count={3} />
            <BannerSkeleton />
            <StatTilesSkeleton />
            <ChartsSkeleton />
          </div>
        }
      >
        <Home client={{ id: session.client_id, name: session.name, avatarUrl: session.avatarUrl }} />
      </Loading>
    </ClientShell>
  );
}

async function Home({ client }: { client: { id: string; name: string; avatarUrl: string | null } }) {
  const [items, slides, catalog, wallet, owing, showroomSettings] = await Promise.all([
    fetchClientItems(client.id),
    fetchMarketingSlides(true),
    fetchProductCatalog(true),
    getMyWalletSummary(),
    // Like the wallet: if it can't load, the home screen still works without it.
    getMyOwing().catch(() => null),
    fetchShowroomSettings(),
  ]);
  const deals = discounted(catalog);
  // Aming's products (not the packaging and lamination options), the ones with a picture first.
  const products = catalog
    .filter((c) => c.in_showroom && !isOptionCategory(c))
    .flatMap((c) => c.products.map((product) => ({ product, category: c.name })))
    .sort((a, b) => Number(!!b.product.display_image_url) - Number(!!a.product.display_image_url));
  return (
    <div className="space-y-6">
      {owing ? <OwingBanner owing={owing} /> : null}
      {deals.length ? <DealsWelcome title={dealsTitle(deals)} deals={deals} showPrices={showroomSettings.show_prices} /> : null}
      {/* Cancelled orders aren't work in progress — keep them out of the stats. */}
      <ClientDashboard
        client={client}
        items={items.filter((i) => !i.order.cancelled_at)}
        slides={slides}
        products={products}
        // If the wallet can't load, the home screen still works — it just has no balance tile.
        wallet={wallet.ok ? <WalletSummaryCard summary={wallet.data} holder={client.name} /> : null}
        money={await clientMoney()}
      />
    </div>
  );
}


/** Aming's products on a running discount (their own price, a size's, or the price agreed on a call), the ones with a picture first. */
function discounted(catalog: ProductCategory[]): Deal[] {
  return catalog
    .filter((c) => c.in_showroom && !isOptionCategory(c))
    .flatMap((c) =>
      c.products.flatMap((product): Deal[] => {
        const sizeOffer = product.variants
          .map((v) => v.offer)
          .filter((o) => o != null)
          .sort((a, b) => a.price - b.price)[0];
        const offer = product.offer ?? sizeOffer ?? product.pending_offer;
        if (!offer) return [];
        // Only what the card shows crosses to the browser.
        const { id, name, slug, description, display_image_url } = product;
        return [{ product: { id, name, slug, description, display_image_url }, categoryId: c.id, offer, fromSizes: !product.offer }];
      }),
    )
    .sort((a, b) => Number(!!b.product.display_image_url) - Number(!!a.product.display_image_url));
}

/** The running discount's name ("Black November"): the one most deals come from. */
function dealsTitle(deals: Deal[]): string {
  const counts = new Map<string, number>();
  for (const d of deals) counts.set(d.offer.name, (counts.get(d.offer.name) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "Deals";
}
