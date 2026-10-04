import Link from "next/link";

import { OfferingsList } from "@repo/ui/offerings/OfferingsList";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Packages & Services · My Studio" };

export default async function StudioOfferingsPage() {
  const { scope } = await requireStudio();
  const [active, archived] = await Promise.all([offerings.list(scope), offerings.list(scope, true)]);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">What your studio sells. Quotations and bookings are built from these.</p>
        <Link
          href="/studio/offerings/new"
          className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm text-white shadow-theme-xs hover:bg-brand-600"
        >
          Add
        </Link>
      </div>
      <OfferingsList active={active} archived={archived} scope={scope} basePath="/studio/offerings" />
    </>
  );
}
