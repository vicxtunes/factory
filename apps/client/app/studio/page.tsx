import { StudioProfileForm } from "@repo/ui/studios/StudioProfileForm";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "My Studio — Client Portal" };

export default async function MyStudioPage() {
  const { studio } = await requireStudio();

  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">{studio.name}</h2>
        <p className="text-sm text-muted">
          Your studio&apos;s business details. Your clients, quotations, bookings and projects are managed here too.
        </p>
      </div>
      <StudioProfileForm profile={studio} />
    </>
  );
}
