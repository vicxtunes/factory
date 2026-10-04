import { notFound } from "next/navigation";

import { DownloadAll } from "@repo/ui/photos/DownloadAll";
import { MasonryGallery } from "@repo/ui/photos/MasonryGallery";
import { localDate } from "@repo/lib/accounting/core/period";
import { shareTokenSchema } from "@repo/lib/photos/core";
import { photos } from "@repo/lib/photos/server";
import { studioAtSlug } from "@repo/lib/studio-portal/server";

// A project's photos shared by link: client.<domain>/<studio>/g/<secret>.
// No sign-in: holding the link is the permission. Works only at that
// studio's address, until its last day (if any), and stops when the studio
// makes a new link or stops sharing.

export const dynamic = "force-dynamic";
export const metadata = { title: "Photos", robots: { index: false, follow: false } };

export default async function SharedGalleryPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug: rawSlug, token } = await params;
  const at = await studioAtSlug(decodeURIComponent(rawSlug));
  const parsed = shareTokenSchema.safeParse(token);
  if (!at || !parsed.success) notFound();
  const found = await photos.byShareLink(at.scope, parsed.data, localDate(new Date(), at.scope.timeZone));
  if (!found) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <p className="text-sm text-muted">{at.studio.name}</p>
        <h1 className="text-2xl font-semibold">{found.album.title}</h1>
        <p className="text-sm text-muted">
          {found.photos.length} photo{found.photos.length === 1 ? "" : "s"}
        </p>
        <DownloadAll photos={found.photos} name={found.album.title} />
      </header>
      <MasonryGallery photos={found.photos} downloads />
    </main>
  );
}
