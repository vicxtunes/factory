import { requireStudio } from "@repo/lib/studios/server";

import { ClientShell } from "../shell";

export const dynamic = "force-dynamic";

// Every My Studio page: the client's own photography business. The studio is
// created the first time any of these pages opens.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireStudio();
  return (
    <ClientShell session={session}>
      <div className="mx-auto max-w-5xl space-y-4">{children}</div>
    </ClientShell>
  );
}
