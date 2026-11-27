import { notFound, redirect } from "next/navigation";
import { after } from "next/server";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { BackLink } from "@repo/ui/navigation/back";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getDesignerSession } from "@repo/lib/auth/session";
import { filesCaller } from "@repo/lib/files/access";
import { folderIdSchema, orderItemIdSchema } from "@repo/lib/files/core";
import { FileService } from "@repo/lib/files/service";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { GraphicsShell } from "../../../shell";

export const metadata = { title: "Attached folder · Graphics" };

// The designer's copy of staff's attached-folder page (dashboard/(app)/orders/items/[itemId]/drive):
// a studio's Drive folders on an order given to them, to look at, download and add to.
export default async function DesignerItemDrivePage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const session = await getDesignerSession();
  if (!session) redirect("/graphics");
  const itemId = orderItemIdSchema.safeParse((await params).itemId).data;
  const { folder } = await searchParams;
  const folderId = folder === undefined ? null : folderIdSchema.safeParse(folder).data;
  if (!itemId || folderId === undefined) notFound();
  const { data: item } = await createAdminClient().from("order_items").select("product").eq("id", itemId).maybeSingle<{ product: string }>();
  if (!item) notFound();

  return (
    <GraphicsShell name={session.name} avatarUrl={session.avatarUrl}>
      <div className="space-y-3">
        <BackLink href="/graphics" className="text-xs font-medium text-brand-600 hover:underline">
          ← Orders
        </BackLink>
        <Loading skeleton={<RowsSkeleton />}>
          <Browser itemId={itemId} folderId={folderId} product={item.product} />
        </Loading>
      </div>
    </GraphicsShell>
  );
}

async function Browser({ itemId, folderId, product }: { itemId: string; folderId: string | null; product: string }) {
  const via = { as: "order", itemId } as const;
  const found = await filesCaller(via).catch(() => null);
  if (!found) notFound();
  const listing = await found.drive.list(found.scope, folderId, found.access);
  if (!listing) notFound();
  if (folderId && FileService.missingPreviews(listing)) after(() => found.drive.ensurePreviews(found.scope, folderId));
  return (
    <>
      <p className="text-sm text-muted">
        From {found.studio.name}&apos;s Drive, for {product}. You can look, download and add files.
      </p>
      <FileBrowser
        listing={listing}
        basePath={`/graphics/items/${itemId}/drive`}
        scope={{ locale: found.scope.locale, timeZone: found.scope.timeZone }}
        via={via}
        topLabel="Attached"
      />
    </>
  );
}
