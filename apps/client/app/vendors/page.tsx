import { notFound } from "next/navigation";

import { StudioStatusBadge } from "@repo/ui/studio-access/StatusBadge";
import { getClientSession } from "@repo/lib/auth/session";
import { businessKindLabel } from "@repo/lib/studios/core";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";
import { studiosOf } from "@repo/lib/studios/server";

import { OpenVendorBusiness, VendorStart } from "./vendor-start";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendors · Aming Space" };

// Where a vendor starts on Aming, open to anyone: choose what the business
// does and set it up (the same set-up and review as a studio), or open the
// one they have. Starting one needs an Aming account (it's theirs), so a
// visitor signs in then. The marketplace of vendors comes next.
export default async function VendorsPage() {
  if (!STUDIOS_ENABLED) notFound();
  const session = await getClientSession();
  const vendor = session ? (await studiosOf(session.client_id)).owned.vendor : null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">Vendors on Aming</p>
        <h1 className="text-2xl font-semibold">{vendor ? "Your vendor business" : "Work with photographers and events"}</h1>
        <p className="text-sm text-muted">
          {vendor
            ? "Run it from My Business: your packages, clients, bookings, invoices and payments."
            : "Photo editors, videographers, decorators, caterers and more: get booked by photographers and their clients, send quotations and invoices, and get paid by mobile money. Set-up takes about 5 minutes; Aming reviews every business before it opens."}
        </p>
      </header>

      {vendor ? (
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{vendor.name}</p>
              <p className="text-sm text-muted">{businessKindLabel(vendor.kind, vendor.vendorCategory)}</p>
            </div>
            <StudioStatusBadge status={vendor.status} />
          </div>
          <OpenVendorBusiness id={vendor.id} status={vendor.status} />
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
          <h2 className="mb-4 font-semibold">What does your business do?</h2>
          <VendorStart signedIn={!!session} />
        </section>
      )}
    </main>
  );
}
