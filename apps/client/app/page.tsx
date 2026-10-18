import { redirect } from "next/navigation";

import { BannerSkeleton, ChartsSkeleton, ChipRowSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { OwingBanner } from "@repo/ui/invoices/OwingBanner";
import { WalletSummaryCard } from "@repo/ui/wallet/WalletSummaryCard";
import { getClientSession } from "@repo/lib/auth/session";
import { getMyOwing } from "@repo/lib/invoices/actions";
import { isOptionCategory } from "@repo/lib/catalog-options";
import { fetchClientItems, fetchMarketingSlides, fetchProductCatalog } from "@repo/lib/queries";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";
import { vendors } from "@repo/lib/vendors/server";
import { getMyWalletSummary } from "@repo/lib/wallet/actions";

import { ClientDashboard } from "./dashboard";
import { Landing } from "./landing";
import { rememberedClient } from "./remembered-device";
import { ClientShell } from "./shell";
import { ShowroomView } from "./showroom-view";
import { SignInOverlay } from "./sign-in-overlay";


export default async function ClientSidePage({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string; client?: string }>;
}) {
  const session = await getClientSession();

  if (!session) {
    // Signed-out visitors land on Aming Space's landing page (the public
    // showroom while studios are off); the sign-in form only shows when asked
    // for (?signin=1, e.g. from the topbar's Log in link) — or straight away
    // on a browser that remembers its account: the lock screen.
    const params = await searchParams;
    const front = STUDIOS_ENABLED ? <Landing /> : <ShowroomView />;
    if (!params.signin && !(await rememberedClient())) return front;
    return <SignInOverlay behind={front} />;
  }

  // A vendor's account opens on its vendor side; its client side is one link away (?client=1).
  if (!(await searchParams).client && (await vendors.mine(session.client_id))) redirect("/vendors");

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
  const [items, slides, catalog, wallet, owing] = await Promise.all([
    fetchClientItems(client.id),
    fetchMarketingSlides(true),
    fetchProductCatalog(true),
    getMyWalletSummary(),
    // Like the wallet: if it can't load, the home screen still works without it.
    getMyOwing().catch(() => null),
  ]);
  // Aming's products (not the packaging and lamination options), the ones with a picture first.
  const products = catalog
    .filter((c) => !isOptionCategory(c))
    .flatMap((c) => c.products.map((product) => ({ product, category: c.name })))
    .sort((a, b) => Number(!!b.product.display_image_url) - Number(!!a.product.display_image_url));
  return (
    <div className="space-y-6">
      {owing ? <OwingBanner owing={owing} /> : null}
      {/* Cancelled orders aren't work in progress — keep them out of the stats. */}
      <ClientDashboard
        client={client}
        items={items.filter((i) => !i.order.cancelled_at)}
        slides={slides}
        products={products}
        // If the wallet can't load, the home screen still works — it just has no balance tile.
        wallet={wallet.ok ? <WalletSummaryCard summary={wallet.data} holder={client.name} /> : null}
      />
    </div>
  );
}

