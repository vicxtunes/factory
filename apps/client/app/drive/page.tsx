import { notFound, redirect } from "next/navigation";
import { after } from "next/server";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getClientSession } from "@repo/lib/auth/session";
import { filesCaller } from "@repo/lib/files/access";
import { folderIdSchema } from "@repo/lib/files/core";
import { FileService } from "@repo/lib/files/service";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";

import { ClientShell } from "../shell";

export const metadata = { title: "Drive" };
export const dynamic = "force-dynamic";

const VIA = { as: "studio" } as const;

// The client's Drive from the marketplace (owner, 2026-11-12): the same Drive
// as My Business → Drive, open before the business is approved, so big
// photo sets and videos for an order go here and are picked on the order
// form (or sent here from it). One folder at a time (?folder=<id>).
export default async function ClientDrivePage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  if (!STUDIOS_ENABLED) notFound();
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");
  const { folder } = await searchParams;
  const folderId = folder === undefined ? null : folderIdSchema.safeParse(folder).data;
  if (folderId === undefined) notFound();

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Drive</h1>
          <p className="mt-1 text-sm text-muted">
            Your photos, videos and files, in folders. Big sets for an order go faster here: they upload in the background, carry on if the connection drops, and you pick them when you order.
          </p>
        </div>
        <Loading skeleton={<RowsSkeleton />}>
          <Browser folderId={folderId} />
        </Loading>
      </div>
    </ClientShell>
  );
}

async function Browser({ folderId }: { folderId: string | null }) {
  const { drive, scope, access } = await filesCaller(VIA);
  const [found, usage] = await Promise.all([drive.list(scope, folderId, access), drive.usage(scope)]);
  if (!found) notFound();
  // Pictures uploaded before small copies existed get them now, in the background.
  if (folderId && FileService.missingPreviews(found)) after(() => drive.ensurePreviews(scope, folderId));
  return (
    <>
      {access.kind === "full" ? <UsageBar usage={usage} /> : null}
      <FileBrowser listing={found} basePath="/drive" scope={{ locale: scope.locale, timeZone: scope.timeZone }} via={VIA} topLabel={access.kind === "full" ? "Drive" : "Shared with you"} />
    </>
  );
}
