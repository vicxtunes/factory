import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { PackagesEditor } from "@repo/ui/offerings/PackagesEditor";
import { ServiceArchiveButton, ServiceForm } from "@repo/ui/offerings/ServiceForm";
import { ServiceMediaPanel } from "@repo/ui/photos/ServiceMediaPanel";
import { serviceIdSchema } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";
import { photos } from "@repo/lib/photos/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Service · My Studio" };

export default async function StudioServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = serviceIdSchema.safeParse((await params).id);
  const service = id.success ? await offerings.service(scope, id.data) : null;
  if (!service) notFound();

  const [onSale, archived, gallery, usage] = await Promise.all([
    offerings.packages(scope, service.id),
    offerings.packages(scope, service.id, true),
    photos.serviceGallery(scope, service.id),
    photos.usage(scope),
  ]);
  const galleryPhotos = gallery ? await photos.photos(scope, gallery.id) : [];

  return (
    <>
      <div>
        <Link href="/studio/offerings" className="text-xs font-medium text-brand-600 hover:underline">
          ← Packages & Services
        </Link>
        <h2 className="mt-1 text-xl font-semibold">
          {service.name}
          {service.archivedAt ? <span className="ml-2 align-middle text-xs font-normal text-muted">archived</span> : null}
        </h2>
      </div>
      <ServiceForm key={service.id} service={service} basePath="/studio/offerings" />
      <section className="space-y-3">
        <SectionLabel>Packages</SectionLabel>
        <PackagesEditor serviceId={service.id} packages={onSale} archived={archived} scope={scope} canAdd={!service.archivedAt} />
      </section>
      <section className="space-y-3">
        <SectionLabel>Photos and video</SectionLabel>
        <ServiceMediaPanel serviceId={service.id} album={gallery} photos={galleryPhotos} usage={usage} />
      </section>
      <ServiceArchiveButton service={service} />
    </>
  );
}
