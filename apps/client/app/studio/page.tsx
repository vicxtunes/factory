import { StudioProfileForm } from "@repo/ui/studios/StudioProfileForm";
import { ownerOf, requireStudioOwner, studios } from "@repo/lib/studios/server";

import { ClientShell } from "../shell";

export const metadata = { title: "My Studio — Client Portal" };
export const dynamic = "force-dynamic";

// The client's own photography business. Opening it the first time creates it.
export default async function MyStudioPage() {
  const session = await requireStudioOwner();
  const studio = await studios.open(ownerOf(session));

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{studio.name}</h2>
          <p className="text-sm text-muted">
            Your studio&apos;s business details. Your clients, quotations, bookings and projects will be managed here too.
          </p>
        </div>
        <StudioProfileForm profile={studio} />
      </div>
    </ClientShell>
  );
}
