import { Header } from "@repo/ui/Header";
import { BannerSkeleton, ChartsSkeleton, ChipRowSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { OwingBanner } from "@repo/ui/invoices/OwingBanner";
import { WalletSummaryCard } from "@repo/ui/wallet/WalletSummaryCard";
import { getClientSession } from "@repo/lib/auth/session";
import { getMyOwing } from "@repo/lib/invoices/actions";
import { fetchClientItems, fetchMarketingSlides } from "@repo/lib/queries";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";
import { getMyWalletSummary } from "@repo/lib/wallet/actions";

import { AuthGate } from "./auth-gate";
import { ClientDashboard } from "./dashboard";
import { Landing } from "./landing";
import { ClientShell } from "./shell";
import { ShowroomView } from "./showroom-view";


export default async function ClientSidePage({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  const session = await getClientSession();

  if (!session) {
    // Signed-out visitors land on Aming Space's landing page (the public
    // showroom while studios are off); the sign-in form only shows when asked
    // for (?signin=1, e.g. from the topbar's Log in link).
    const params = await searchParams;
    if (!params.signin) return STUDIOS_ENABLED ? <Landing /> : <ShowroomView />;
    return (
      <>
        <Header surface="Client Portal" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
          <AuthGate />
        </main>
      </>
    );
  }

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
        <Home client={{ id: session.client_id, name: session.name }} />
      </Loading>
    </ClientShell>
  );
}

async function Home({ client }: { client: { id: string; name: string } }) {
  const [items, slides, wallet, owing] = await Promise.all([
    fetchClientItems(client.id),
    fetchMarketingSlides(true),
    getMyWalletSummary(),
    // Like the wallet: if it can't load, the home screen still works without it.
    getMyOwing().catch(() => null),
  ]);
  return (
    <div className="space-y-6">
      {owing ? <OwingBanner owing={owing} /> : null}
      {/* Cancelled orders aren't work in progress — keep them out of the stats. */}
      <ClientDashboard
        items={items.filter((i) => !i.order.cancelled_at)}
        slides={slides}
        // If the wallet can't load, the home screen still works — it just has no balance card.
        wallet={wallet.ok ? <WalletSummaryCard summary={wallet.data} client={client} /> : null}
      />
    </div>
  );
}

