import { AccountsOverview } from "@repo/ui/accounting/AccountsOverview";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { periodFrom } from "@repo/lib/accounting/params";
import { studioAccounts } from "@repo/lib/billing/server";
import { CurrencySymbolProvider } from "@repo/lib/currency/CurrencySymbolProvider";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "My Studio — Client Portal" };

/** Where the studio's figures lead. */
const LINKS = { sales: "/studio/invoices", overdue: "/studio/invoices", clients: "/studio/clients", client: "/studio/clients/" };

// The studio's dashboard: its money at a glance, from its invoices and
// payments (packages/lib/billing → Accounts). The studio is created the first
// time any My Studio page opens.
export default async function StudioDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { scope, studio } = await requireStudio();
  const view = await studioAccounts.overview(scope, periodFrom(await searchParams));

  return (
    <>
      <h2 className="text-xl font-semibold">{studio.name}</h2>
      {/* Amounts in the studio's own currency. */}
      <CurrencySymbolProvider symbol={scope.currency}>
        <div className="space-y-6">
          <PeriodPicker period={view.period} />
          <AccountsOverview view={view} links={LINKS} showHeld={false} />
        </div>
      </CurrencySymbolProvider>
    </>
  );
}
