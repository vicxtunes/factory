import { StudioProfileForm } from "@repo/ui/studios/StudioProfileForm";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Studio profile — My Studio" };

export default async function StudioProfilePage() {
  const { studio } = await requireStudio();

  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">{studio.name}</h2>
        <p className="text-sm text-muted">
          Your studio&apos;s business details, shown on your quotations, invoices and receipts.
        </p>
      </div>
      <StudioProfileForm profile={studio} />
    </>
  );
}
