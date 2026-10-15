import { notFound, permanentRedirect } from "next/navigation";
import { after } from "next/server";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { folderIdSchema, shareTokenSchema } from "@repo/lib/files/core";
import { files } from "@repo/lib/files/server";
import { FileService } from "@repo/lib/files/service";
import { studioAtSlug } from "@repo/lib/studio-portal/server";
import { tasks } from "@repo/lib/tasks/server";

// A client's task opened by its link: client.<domain>/<studio>/t/<secret>
// (?folder=<id> inside its folder). No sign-in: holding the link is the
// permission, for that task only: its photos to look at (no downloads), and
// choosing, commenting or naming them, then Send. The photos are proofs
// (still in production): watermarked, and nothing to save, copy or print
// from the page. Works only at that studio's address, and stops when the task
// is deleted.

export const dynamic = "force-dynamic";
export const metadata = { title: "Your photos", robots: { index: false, follow: false } };

export default async function TaskLinkPage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ folder?: string }> }) {
  const { slug: rawSlug, token } = await params;
  const slug = decodeURIComponent(rawSlug);
  const at = await studioAtSlug(slug);
  const secret = shareTokenSchema.safeParse(token);
  if (!at || !secret.success) notFound();
  if (at.redirectTo) permanentRedirect(`/${at.redirectTo}/t/${secret.data}`);
  const task = await tasks.byShareToken(at.scope, secret.data);
  if (!task?.folderId) notFound();

  const access = { kind: "shared" as const, grants: [{ folderId: task.folderId, role: "viewer" as const, canDownload: false }] };
  const { folder } = await searchParams;
  const folderId = folder === undefined ? task.folderId : folderIdSchema.safeParse(folder).data;
  const listing = folderId ? await files.list(at.scope, folderId, access) : null;
  if (!listing) notFound();
  // Photos without their small copies yet show as "Preparing…": make them now, for the next look.
  const taskFolder = task.folderId;
  if (FileService.missingPreviews(listing)) after(() => files.ensurePreviews(at.scope, taskFolder));

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <p className="text-sm text-muted">
        From {at.studio.name}
        {task.customerName ? ` for ${task.customerName}` : ""}
      </p>
      <FileBrowser
        listing={listing}
        basePath={`/${slug}/t/${secret.data}`}
        scope={{ locale: at.scope.locale, timeZone: at.scope.timeZone }}
        via={{ as: "task", slug, token: secret.data }}
        topLabel="Your photos"
        protect={{ watermark: `PROOF · ${at.studio.name}` }}
        task={{
          id: task.id,
          title: task.title,
          kind: task.kind,
          pickMin: task.pickMin,
          pickMax: task.pickMax,
          dueOn: task.dueOn,
          done: task.status === "done",
          picks: task.kind === "choose" ? await files.picks(at.scope, task.id) : [],
          mine: true,
          forName: null,
        }}
      />
    </main>
  );
}
