import Link from "next/link";
import { notFound } from "next/navigation";

import { OfferingArchiveButton, OfferingForm } from "@repo/ui/offerings/OfferingForm";
import { OFFERING_KIND_LABELS, offeringIdSchema } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Package or service · My Studio" };

export default async function StudioOfferingPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = offeringIdSchema.safeParse((await params).id);
  const offering = id.success ? await offerings.get(scope, id.data) : null;
  if (!offering) notFound();

  return (
    <>
      <div>
        <Link href="/studio/offerings" className="text-xs font-medium text-brand-600 hover:underline">
          ← Packages & Services
        </Link>
        <h2 className="mt-1 text-xl font-semibold">
          {offering.name}
          <span className="ml-2 align-middle text-xs font-normal text-muted">
            {OFFERING_KIND_LABELS[offering.kind]}
            {offering.archivedAt ? " · archived" : ""}
          </span>
        </h2>
      </div>
      <OfferingForm key={offering.id} offering={offering} basePath="/studio/offerings" currency={scope.currency} />
      <OfferingArchiveButton offering={offering} />
    </>
  );
}
