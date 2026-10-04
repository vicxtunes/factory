import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DownloadAll } from "@repo/ui/photos/DownloadAll";
import { MasonryGallery } from "@repo/ui/photos/MasonryGallery";
import { photos } from "@repo/lib/photos/server";
import { projectIdSchema } from "@repo/lib/projects/core";
import { projects } from "@repo/lib/projects/server";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";

// A signed-in client's photos for one of their projects:
// client.<domain>/<studio>/me/photos/<project>. Only their own projects.

export const dynamic = "force-dynamic";
export const metadata = { title: "Your photos", robots: { index: false, follow: false } };

export default async function ClientPhotosPage({ params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug: rawSlug, projectId } = await params;
  const slug = decodeURIComponent(rawSlug);
  const at = await studioAtSlug(slug);
  if (!at || at.redirectTo) notFound();
  const me = await portalClient(at.studio.id);
  if (!me) redirect(`/${slug}`);
  const id = projectIdSchema.safeParse(projectId);
  const view = id.success ? await projects.get(at.scope, id.data) : null;
  // Another client's project at the same studio is "not found" too.
  if (!view || view.project.customerId !== me.customerId) notFound();
  const album = await photos.delivery(at.scope, view.project.id);
  const list = album ? await photos.photos(at.scope, album.id, true) : [];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <Link href={`/${slug}/me`} className="text-sm text-muted hover:underline">
          ← {at.studio.name}
        </Link>
        <h1 className="text-2xl font-semibold">{view.project.title}</h1>
        <p className="text-sm text-muted">
          {list.length} photo{list.length === 1 ? "" : "s"}
        </p>
        <DownloadAll photos={list} name={view.project.title} />
      </header>
      <MasonryGallery photos={list} downloads />
    </main>
  );
}
