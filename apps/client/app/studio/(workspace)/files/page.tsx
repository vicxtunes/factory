import { Suspense } from "react";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { FileBrowser, type FolderTask } from "@repo/ui/files/FileBrowser";
import { BuySpace } from "@repo/ui/photos/BuySpace";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { Skeleton } from "@repo/ui/Skeleton";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { customers } from "@repo/lib/customers/server";
import { filesCaller } from "@repo/lib/files/access";
import { businessListing } from "@repo/lib/files/business";
import { businessTree, folderIdSchema, isBusinessId, type FileAccess } from "@repo/lib/files/core";
import { files } from "@repo/lib/files/server";
import { FileService } from "@repo/lib/files/service";
import { photos } from "@repo/lib/photos/server";
import { portal, studioUrl } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";
import { taskIdSchema } from "@repo/lib/tasks/core";
import { tasks } from "@repo/lib/tasks/server";
import { canUse } from "@repo/lib/team/core";
import { team } from "@repo/lib/team/server";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { amingCardBalance } from "@repo/lib/wallet/studio";

export const metadata = { title: "Drive · My Business" };

const VIA = { as: "studio" } as const;

// The studio's files, one folder at a time (?folder=<id>; none: the top).
// The owner and the Files team have everything, share folders and see the
// storage (the owner can buy more); any other team member sees only the
// folders shared with them. Whoever also manages what the business sells
// (Packages & showroom) finds it in Business: each service's and product's
// photos and preview video.
export default async function StudioFilesPage({ searchParams }: { searchParams: Promise<{ folder?: string; task?: string }> }) {
  const { scope, studio, access: member } = await requireStudio("anyone");
  const { folder, task: taskParam } = await searchParams;
  const { access } = await filesCaller(VIA);
  const business = access.kind === "full" && canUse(member, "catalog");
  if (folder !== undefined && isBusinessId(folder)) {
    if (!business) notFound();
    return (
      <Loading skeleton={<RowsSkeleton />}>
        <Business scope={scope} folderId={folder} />
      </Loading>
    );
  }
  const folderId = folder === undefined ? null : folderIdSchema.safeParse(folder).data;
  if (folderId === undefined) notFound();

  // A task being looked at here (?task=): the business sees how the client's choosing or feedback is going; a member does their own.
  const memberId = member.owner ? null : member.memberId;
  const task = await folderTask(scope, taskParam, memberId);

  if (access.kind !== "full") {
    return (
      <>
        <p className="text-sm text-muted">Folders the business has shared with you.</p>
        <Loading skeleton={<RowsSkeleton />}>
          <Browser scope={scope} folderId={folderId} access={access} task={task?.mine ? task : undefined} />
        </Loading>
      </>
    );
  }
  return (
    <>
      <p className="text-sm text-muted">Contracts, design files, videos, zips: anything your business keeps, in folders, stored as you uploaded it.</p>
      <Suspense fallback={<Skeleton className="h-6 w-full" />}>
        <Storage scope={scope} ownerClientId={member.owner ? studio.ownerClientId : null} />
      </Suspense>
      <Loading skeleton={<RowsSkeleton />}>
        <Browser scope={scope} folderId={folderId} access={access} business={business} task={task} />
      </Loading>
    </>
  );
}

async function folderTask(scope: TenantScope, taskParam: string | undefined, memberId: string | null): Promise<FolderTask | undefined> {
  const id = taskIdSchema.safeParse(taskParam);
  const found = id.success ? await tasks.get(scope, id.data) : null;
  if (!found || found.kind === "todo") return undefined;
  return {
    id: found.id,
    title: found.title,
    kind: found.kind,
    pickMin: found.pickMin,
    pickMax: found.pickMax,
    dueOn: found.dueOn,
    done: found.status === "done",
    picks: found.kind === "choose" ? await files.picks(scope, found.id) : [],
    mine: memberId !== null && found.assigneeId === memberId,
    forName: found.customerName ?? found.assigneeName,
  };
}

async function Business({ scope, folderId }: { scope: TenantScope; folderId: string }) {
  const listing = await businessListing(scope, folderId);
  if (!listing) notFound();
  return <FileBrowser listing={listing} basePath="/studio/files" scope={{ locale: scope.locale, timeZone: scope.timeZone }} via={VIA} topLabel="Drive" />;
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

async function Browser({
  scope,
  folderId,
  access,
  business = false,
  task,
}: {
  scope: TenantScope;
  folderId: string | null;
  access: FileAccess;
  business?: boolean;
  task?: FolderTask;
}) {
  const found = await files.list(scope, folderId, access);
  if (!found) notFound();
  // Pictures uploaded before small copies existed get them now, in the background.
  if (folderId && FileService.missingPreviews(found)) after(() => files.ensurePreviews(scope, folderId));
  // At the top, Business comes first (with Projects and the rest).
  const root = business && folderId === null ? businessTree([], new Map())[0] : undefined;
  const listing = root ? { ...found, folders: [root, ...found.folders] } : found;
  const browser = { listing, basePath: "/studio/files", scope: { locale: scope.locale, timeZone: scope.timeZone }, via: VIA, task, topLabel: "Drive" };
  if (access.kind !== "full") return <FileBrowser {...browser} topLabel="Shared with you" />;
  // Whoever has everything shares: with clients, with team members who haven't the Files area, or by link.
  const [shares, clientList, members, slug] = await Promise.all([files.shares(scope), customers.list(scope), team.active(scope), portal.currentSlug(scope.tenantId)]);
  return (
    <FileBrowser
      {...browser}
      sharing={{
        shares,
        people: {
          clients: clientList.map((c) => ({ id: c.id, name: c.name })),
          members: members.filter((m) => !canUse({ owner: false, memberId: m.id, areas: m.access }, "files")).map((m) => ({ id: m.id, name: m.name })),
        },
        linkBase: slug ? studioUrl(`${slug}/f/`) : null,
      }}
    />
  );
}
