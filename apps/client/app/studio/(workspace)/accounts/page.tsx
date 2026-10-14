import { Suspense } from "react";

import { AccountsOverview } from "@repo/ui/accounting/AccountsOverview";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { ProductRequestsList } from "@repo/ui/product-requests/ProductRequestsList";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { ChartsSkeleton, ChipRowSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { periodFrom } from "@repo/lib/accounting/params";
import { studioAccounts } from "@repo/lib/billing/server";
import { CurrencySymbolProvider } from "@repo/lib/currency/CurrencySymbolProvider";
import { productRequests } from "@repo/lib/product-requests/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { paidForStudioRequests } from "@repo/lib/wallet/studio";

export const metadata = { title: "Accounts · My Business" };

/** Where the studio's figures lead. */
const LINKS = { sales: "/studio/invoices", overdue: "/studio/invoices", clients: "/studio/clients", client: "/studio/clients/" };

// The studio's books: the orders waiting for an answer, and its accounts from
// its invoices and payments (packages/lib/billing → Accounts). The money it
// holds is on Wallet (../wallet).
export default async function StudioAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { scope } = await requireStudio("money");

  return (
    <>
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
