import { notFound, permanentRedirect } from "next/navigation";
import { after } from "next/server";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { localDate } from "@repo/lib/accounting/core/period";
import { folderIdSchema, shareTokenSchema } from "@repo/lib/files/core";
import { files } from "@repo/lib/files/server";
import { FileService } from "@repo/lib/files/service";
import { studioAtSlug } from "@repo/lib/studio-portal/server";

// A folder shared by link: client.<domain>/<studio>/f/<secret>(?folder=<id>).
// No sign-in: holding the link is the permission, as far as the share goes
// (viewer, contributor or editor, with or without downloads). Works only at
// that studio's address, until its last day (if any), and stops when the
// studio stops sharing.

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared folder", robots: { index: false, follow: false } };

export default async function SharedFolderPage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ folder?: string }> }) {
  const { slug: rawSlug, token } = await params;
  const slug = decodeURIComponent(rawSlug);
  const at = await studioAtSlug(slug);
  const secret = shareTokenSchema.safeParse(token);
  if (!at || !secret.success) notFound();
  if (at.redirectTo) permanentRedirect(`/${at.redirectTo}/f/${secret.data}`);
  const access = await files.linkAccess(at.scope, secret.data, localDate(new Date(), at.scope.timeZone));
  if (!access || access.kind !== "shared") notFound();

  // The link opens its folder; ?folder= goes inside it.
  const { folder } = await searchParams;
  const folderId = folder === undefined ? access.grants[0].folderId : folderIdSchema.safeParse(folder).data;
  const listing = folderId ? await files.list(at.scope, folderId, access) : null;
  if (!listing || !folderId) notFound();
  // Pictures without their small copies yet: make them now, so they show (and load fast) next time.
  if (FileService.missingPreviews(listing)) after(() => files.ensurePreviews(at.scope, folderId));

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <p className="text-sm text-muted">Shared with you by {at.studio.name}</p>
      <FileBrowser
        listing={listing}
        basePath={`/${slug}/f/${secret.data}`}
        scope={{ locale: at.scope.locale, timeZone: at.scope.timeZone }}
        via={{ as: "link", slug, token: secret.data }}
        topLabel="Shared with you"
      />
    </main>
  );
}
