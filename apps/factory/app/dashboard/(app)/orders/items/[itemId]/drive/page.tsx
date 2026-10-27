import { notFound } from "next/navigation";
import { after } from "next/server";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { BackLink } from "@repo/ui/navigation/back";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { filesCaller } from "@repo/lib/files/access";
import { folderIdSchema, orderItemIdSchema } from "@repo/lib/files/core";
import { FileService } from "@repo/lib/files/service";
import { createAdminClient } from "@repo/lib/supabase/admin";

export const metadata = { title: "Attached folder · Orders" };

// A studio's Drive folders attached to an order item ("From my Drive" when it
// was placed), a folder at a time (?folder=<id>; none: the attached ones).
// Staff look, download (one by one or as zips, made in the browser) and add
// files; nothing here is deleted, and the studio can't delete them either
// until the order is done (packages/lib/files → attachments).
export default async function OrderItemDrivePage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const itemId = orderItemIdSchema.safeParse((await params).itemId).data;
  const { folder } = await searchParams;
  const folderId = folder === undefined ? null : folderIdSchema.safeParse(folder).data;
  if (!itemId || folderId === undefined) notFound();
  const { data: item } = await createAdminClient().from("order_items").select("order_id, product").eq("id", itemId).maybeSingle<{ order_id: string; product: string }>();
  if (!item) notFound();

  return (
    <div className="space-y-3">
      <BackLink href={`/dashboard/orders?order=${item.order_id}`} className="text-xs font-medium text-brand-600 hover:underline">
        ← Order
      </BackLink>
      <Loading skeleton={<RowsSkeleton />}>
        <Browser itemId={itemId} folderId={folderId} product={item.product} />
      </Loading>
    </div>
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
        From {found.studio.name}&apos;s Drive, for {product}. You can look, download and add files. Nothing here can be deleted until the order is done.
      </p>
      <FileBrowser
        listing={listing}
        basePath={`/dashboard/orders/items/${itemId}/drive`}
        scope={{ locale: found.scope.locale, timeZone: found.scope.timeZone }}
        via={via}
        topLabel="Attached"
      />
    </>
  );
}
