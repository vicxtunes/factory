import Link from "next/link";

import { offerPrice } from "@repo/lib/vendors/core";
import { vendors } from "@repo/lib/vendors/server";

import { VendorFrame } from "../frame";
import { requireVendor } from "../vendor";

export const metadata = { title: "Services" };

// The vendor's services: each with its price and samples of their work, as
// studios see them. Adding one goes on to its samples.
export default async function VendorServicesPage() {
  const { vendor } = await requireVendor();
  const covers = await Promise.all(vendor.offers.map((o) => (o.samples[0] ? vendors.pictureUrl(o.samples[0].key) : null)));

  return (
    <VendorFrame vendor={vendor} page="services">
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
            <p className="mt-1 text-sm text-muted">What you offer studios, with your prices and samples of your work.</p>
          </div>
          <Link href="/vendors/services/new" className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600">
            Add a service
          </Link>
        </div>
        {vendor.offers.length ? (
          <ul className="space-y-3">
            {vendor.offers.map((o, i) => (
              <li key={o.id}>
                <Link href={`/vendors/services/${o.id}`} className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-3 shadow-theme-xs transition hover:border-brand-500/40 hover:shadow-md">
                  <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-background text-xs text-muted">
                    {covers[i] ? (
                      // A short-lived signed link to the private bucket: a plain img.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={covers[i]} alt="" className="size-full object-cover" />
                    ) : (
                      "No samples"
                    )}
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block truncate font-semibold">{o.name}</span>
                    <span className="block text-sm text-muted tabular-nums">{offerPrice(o)}</span>
                    <span className="block text-xs text-muted">
                      {o.samples.length} sample{o.samples.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-3xl border border-dashed border-border p-8 text-center">
            <p className="font-medium">No services yet</p>
            <p className="mt-1 text-sm text-muted">Add what you offer, its price, and a few samples of your work. Studios hire from here.</p>
          </div>
        )}
      </div>
    </VendorFrame>
  );
}
