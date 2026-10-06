import Link from "next/link";

import { ServicesList } from "@repo/ui/offerings/ServicesList";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Packages & Services · My Studio" };

export default async function StudioOfferingsPage() {
  const { scope } = await requireStudio();
  const [onSale, archived] = await Promise.all([offerings.catalog(scope), offerings.services(scope, true)]);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">
          Your services, each with its packages. Your showroom shows them; quotations and bookings are built from the packages.
        </p>
        <Link
          href="/studio/offerings/new"
          className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm text-white shadow-theme-xs hover:bg-brand-600"
        >
          Add a service
        </Link>
      </div>
      <ServicesList services={onSale} archived={archived} scope={scope} basePath="/studio/offerings" />
    </>
  );
}
