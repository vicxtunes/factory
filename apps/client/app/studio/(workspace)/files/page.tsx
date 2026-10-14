import { Suspense } from "react";
import { notFound } from "next/navigation";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { BuySpace } from "@repo/ui/photos/BuySpace";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { Skeleton } from "@repo/ui/Skeleton";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { folderIdSchema } from "@repo/lib/files/core";
import { files } from "@repo/lib/files/server";
import { photos } from "@repo/lib/photos/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { amingCardBalance } from "@repo/lib/wallet/studio";

export const metadata = { title: "Files · My Business" };

// The studio's files, one folder at a time (?folder=<id>; none: the top),
// under the storage they share with its photos. The owner can buy more.
export default async function StudioFilesPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const { scope, studio, access } = await requireStudio("files");
  const { folder } = await searchParams;
  const folderId = folder === undefined ? null : folderIdSchema.safeParse(folder).data;
  if (folderId === undefined) notFound();

  return (
    <>
      <p className="text-sm text-muted">Contracts, design files, videos, zips: anything your business keeps, in folders, stored as you uploaded it.</p>
      <Suspense fallback={<Skeleton className="h-6 w-full" />}>
        <Storage scope={scope} ownerClientId={access.owner ? studio.ownerClientId : null} />
      </Suspense>
      <Loading skeleton={<RowsSkeleton />}>
        <Browser scope={scope} folderId={folderId} />
      </Loading>
    </>
  );
}

// Buying is the owner's (it's their Aming card that pays), and only while the boss has it on sale.
async function Storage({ scope, ownerClientId }: { scope: TenantScope; ownerClientId: string | null }) {
  const [usage, pricePerGb] = await Promise.all([files.usage(scope), ownerClientId ? photos.spacePrice() : null]);
  return (
    <div className="space-y-2">
      <UsageBar usage={usage} />
      {ownerClientId && pricePerGb ? <BuySpace pricePerGb={pricePerGb} balance={await amingCardBalance(ownerClientId)} locale={scope.locale} /> : null}
    </div>
  );
}

async function Browser({ scope, folderId }: { scope: TenantScope; folderId: string | null }) {
  const listing = await files.list(scope, folderId);
  if (!listing) notFound();
  return <FileBrowser listing={listing} basePath="/studio/files" scope={{ locale: scope.locale, timeZone: scope.timeZone }} />;
}
