import { BackLink } from "@repo/ui/navigation/back";
import { notFound, redirect } from "next/navigation";

import { DownloadAll } from "@repo/ui/photos/DownloadAll";
import { MasonryGallery } from "@repo/ui/photos/MasonryGallery";
import { ProductGridSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { photos } from "@repo/lib/photos/server";
import { projectIdSchema } from "@repo/lib/projects/core";
import { projects } from "@repo/lib/projects/server";
import type { TenantScope } from "@repo/lib/tenancy/types";
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
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <BackLink href={`/${slug}/me`} className="text-sm text-muted hover:underline">
          ← {at.studio.name}
        </BackLink>
        <h1 className="text-2xl font-semibold">{view.project.title}</h1>
      </header>
      <Loading skeleton={<ProductGridSkeleton />}>
        <Photos scope={at.scope} projectId={view.project.id} title={view.project.title} />
      </Loading>
    </main>
  );
}

async function Photos({ scope, projectId, title }: { scope: TenantScope; projectId: string; title: string }) {
  const album = await photos.delivery(scope, projectId);
  const list = album ? await photos.photos(scope, album.id, true) : [];
  return (
    <>
      <div className="space-y-2">
        <p className="text-sm text-muted">
          {list.length} photo{list.length === 1 ? "" : "s"}
        </p>
        <DownloadAll photos={list} name={title} />
      </div>
      <MasonryGallery photos={list} downloads />
    </>
  );
}
