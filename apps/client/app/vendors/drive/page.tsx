import { notFound } from "next/navigation";
import { after } from "next/server";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { filesCaller } from "@repo/lib/files/access";
import { folderIdSchema, type FileAccess } from "@repo/lib/files/core";
import { FileService } from "@repo/lib/files/service";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { VendorFrame } from "../frame";
import { requireVendor } from "../vendor";

export const metadata = { title: "Drive" };

const VIA = { as: "vendor" } as const;

// A vendor's Drive: clients' work as it comes in, and their own files, in
// folders, one at a time (?folder=<id>; none: the top). Everything in it is
// theirs (packages/lib/files on the vendor's own tables: vendorDrive).
export default async function VendorDrivePage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const { vendor } = await requireVendor();
  const { folder } = await searchParams;
  const folderId = folder === undefined ? null : folderIdSchema.safeParse(folder).data;
  if (folderId === undefined) notFound();
  const { drive, scope, access } = await filesCaller(VIA);

  return (
    <VendorFrame vendor={vendor} page="drive">
      <div className="space-y-4 px-4 py-6 sm:px-6 lg:py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Drive</h1>
        <Loading skeleton={<RowsSkeleton />}>
          <Browser drive={drive} scope={scope} folderId={folderId} access={access} />
        </Loading>
      </div>
    </VendorFrame>
  );
}

async function Browser({ drive, scope, folderId, access }: { drive: FileService; scope: TenantScope; folderId: string | null; access: FileAccess }) {
  const [found, usage] = await Promise.all([drive.list(scope, folderId, access), drive.usage(scope)]);
  if (!found) notFound();
  // Pictures uploaded before small copies existed get them now, in the background.
  if (folderId && FileService.missingPreviews(found)) after(() => drive.ensurePreviews(scope, folderId));
  return (
    <>
      <UsageBar usage={usage} />
      <FileBrowser listing={found} basePath="/vendors/drive" scope={{ locale: scope.locale, timeZone: scope.timeZone }} via={VIA} topLabel="Drive" />
    </>
  );
}
