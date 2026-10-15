import { BackLink } from "@repo/ui/navigation/back";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";

import { FileBrowser, type FolderTask } from "@repo/ui/files/FileBrowser";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { folderIdSchema, type FileAccess } from "@repo/lib/files/core";
import { files } from "@repo/lib/files/server";
import { FileService } from "@repo/lib/files/service";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";
import { taskIdSchema } from "@repo/lib/tasks/core";
import { tasks } from "@repo/lib/tasks/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

// A signed-in client's shared folders: client.<domain>/<studio>/me/files
// (?folder=<id>). Only the folders the studio shared with them, as far as each
// share goes. With ?task=<id> (one of theirs): choosing photos or giving
// feedback there.

export const dynamic = "force-dynamic";
export const metadata = { title: "Your files", robots: { index: false, follow: false } };

export default async function ClientFilesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ folder?: string; task?: string }> }) {
  const slug = decodeURIComponent((await params).slug);
  const at = await studioAtSlug(slug);
  if (!at || at.redirectTo) notFound();
  const me = await portalClient(at.studio.id);
  if (!me) redirect(`/${slug}`);
  const { folder, task: taskParam } = await searchParams;
  const folderId = folder === undefined ? null : folderIdSchema.safeParse(folder).data;
  if (folderId === undefined) notFound();
  const access = await files.clientAccess(at.scope, me.customerId);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <BackLink href={`/${slug}/me`} className="text-sm text-muted hover:underline">
        ← {at.studio.name}
      </BackLink>
      <Loading skeleton={<RowsSkeleton />}>
        <Browser scope={at.scope} slug={slug} studioName={at.studio.name} folderId={folderId} access={access} customerId={me.customerId} taskId={taskParam} />
      </Loading>
    </main>
  );
}

async function Browser({
  scope,
  slug,
  studioName,
  folderId,
  access,
  customerId,
  taskId,
}: {
  scope: TenantScope;
  slug: string;
  studioName: string;
  folderId: string | null;
  access: FileAccess;
  customerId: string;
  taskId: string | undefined;
}) {
  const listing = await files.list(scope, folderId, access);
  if (!listing) notFound();
  if (folderId && FileService.missingPreviews(listing)) after(() => files.ensurePreviews(scope, folderId));
  // Only their own task.
  const id = taskIdSchema.safeParse(taskId);
  const found = id.success ? await tasks.get(scope, id.data) : null;
  const task: FolderTask | undefined =
    found && found.customerId === customerId
      ? {
          id: found.id,
          title: found.title,
          kind: found.kind,
          pickMin: found.pickMin,
          pickMax: found.pickMax,
          dueOn: found.dueOn,
          done: found.status === "done",
          picks: found.kind === "choose" ? await files.picks(scope, found.id) : [],
          mine: true,
          forName: null,
        }
      : undefined;
  return (
    <FileBrowser
      listing={listing}
      basePath={`/${slug}/me/files`}
      scope={{ locale: scope.locale, timeZone: scope.timeZone }}
      via={{ as: "client", slug }}
      topLabel="Shared with you"
      task={task}
      // A task's photos are proofs: watermarked, nothing to save from the page.
      protect={task ? { watermark: `PROOF · ${studioName}` } : undefined}
    />
  );
}
