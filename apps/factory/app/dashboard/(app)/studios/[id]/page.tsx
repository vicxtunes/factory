import Link from "next/link";
import { notFound } from "next/navigation";

import { studioIdSchema } from "@repo/lib/studios/core";
import { requireStudiosOversight, studios } from "@repo/lib/studios/server";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStudiosOversight();
  const id = studioIdSchema.safeParse((await params).id);
  const studio = id.success ? await studios.get(id.data) : null;
  if (!studio) notFound();

  const details: [string, string | null][] = [
    ["Owner", studio.ownerName],
    ["Phone", studio.phone],
    ["Email", studio.email],
    ["Address", studio.address],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/studios" className="text-xs font-medium text-brand-600 hover:underline">
          ← Studios
        </Link>
        <h2 className="mt-1 text-xl font-semibold">{studio.name}</h2>
      </div>
      <dl className="grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:grid-cols-2 sm:p-5">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-line text-sm">{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
