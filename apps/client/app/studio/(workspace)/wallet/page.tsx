import { Suspense } from "react";

import { AccountsOverview } from "@repo/ui/accounting/AccountsOverview";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { HomeHero } from "@repo/ui/home/HomeBits";
import { ProductRequestsList } from "@repo/ui/product-requests/ProductRequestsList";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { Skeleton } from "@repo/ui/Skeleton";
import { ChartsSkeleton, ChipRowSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { periodFrom } from "@repo/lib/accounting/params";
import { studioAccounts } from "@repo/lib/billing/server";
import { CurrencySymbolProvider } from "@repo/lib/currency/CurrencySymbolProvider";
import { productRequests } from "@repo/lib/product-requests/server";
import { requireStudio } from "@repo/lib/studios/server";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { paidForStudioRequests, studioWalletBalance } from "@repo/lib/wallet/studio";

export const metadata = { title: "Wallet · My Business" };

/** Where the studio's figures lead. */
const LINKS = { sales: "/studio/invoices", overdue: "/studio/invoices", clients: "/studio/clients", client: "/studio/clients/" };

// The studio's money in one place: what's in its wallet (where clients'
// mobile money lands), the orders waiting for an answer, and its accounts
// from its invoices and payments (packages/lib/billing → Accounts).
export default async function StudioWalletPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { scope, studio, access } = await requireStudio("money");

  return (
    <>
      <Loading skeleton={<Skeleton className="h-40 w-full rounded-3xl" />}>
        <Balance scope={scope} ownerClientId={studio.ownerClientId} owner={access.owner} />
      </Loading>
      {/* Shown only when there are some, so nothing stands in for it while it loads. */}
      <Suspense fallback={null}>
        <OrderRequests scope={scope} />
      </Suspense>
      {/* Amounts in the studio's own currency. */}
      <CurrencySymbolProvider symbol={scope.currency}>
        <Loading
          skeleton={
            <div className="space-y-6">
              <ChipRowSkeleton count={5} />
              <StatTilesSkeleton />
              <ChartsSkeleton />
            </div>
          }
        >
          <Accounts scope={scope} searchParams={searchParams} />
        </Loading>
      </CurrencySymbolProvider>
    </>
  );
}

// The wallet is Aming's, in shillings, whatever currency the studio bills in.
async function Balance({ scope, ownerClientId, owner }: { scope: TenantScope; ownerClientId: string; owner: boolean }) {
  const balance = await studioWalletBalance(ownerClientId);
  return (
    <HomeHero
      title={formatAmount({ ...scope, currency: "UGX" }, balance)}
      text="In your wallet. What clients pay you by mobile money in the app lands here."
      // Only the owner can open the wallet itself (it's their Aming account's).
      cta={owner ? { label: "Open my wallet", href: "/payment" } : { label: "See invoices", href: "/studio/invoices" }}
    />
  );
}

// Clients who asked for a product online: Confirm makes the invoice.
async function OrderRequests({ scope }: { scope: TenantScope }) {
  const requests = await productRequests.open(scope);
  if (!requests.length) return null;
  const paid = await paidForStudioRequests(requests.map((r) => r.id));
  return (
    <section>
      <SectionLabel>Order requests ({requests.length})</SectionLabel>
      <ProductRequestsList requests={requests} paid={paid} scope={scope} invoicesPath="/studio/invoices" clientsPath="/studio/clients" />
    </section>
  );
}

async function Accounts({ scope, searchParams }: { scope: TenantScope; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = await studioAccounts.overview(scope, periodFrom(await searchParams));
  return (
    <div className="space-y-6">
      <PeriodPicker period={view.period} />
      <AccountsOverview view={view} links={LINKS} showHeld={false} />
    </div>
  );
}
