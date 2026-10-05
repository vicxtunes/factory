import { ProjectGalleryPanel } from "@repo/ui/photos/ProjectGalleryPanel";

import { albumPhotos } from "../_data/media";
import { LookOnly } from "../_data/look-only";

const photos = albumPhotos(8);

// What a studio sees on a project: storage used, upload, the delivered photos, and the share link.
export default function ProjectGalleryDelivery() {
  return (
    <div className="max-w-2xl">
      <LookOnly>
        <ProjectGalleryPanel
          projectId="design-room-project"
          album={{
            id: "design-room-album",
            kind: "delivery",
            projectId: "design-room-project",
            serviceId: null,
            videoKey: null,
            videoBytes: null,
            videoUrl: null,
            shareToken: "sample",
            shareExpiresOn: null,
            title: "Wedding",
            slug: "wedding",
            isPublic: false,
            coverPhotoId: photos[0].id,
            position: 0,
            photoCount: photos.length,
            coverThumbKey: null,
            coverLargeKey: null,
            coverUrl: photos[0].thumbUrl,
            coverLargeUrl: photos[0].largeUrl,
          }}
          photos={photos}
          usage={{ usedBytes: 3.2e9, quotaBytes: 10e9 }}
          shareUrl="https://www.amingspace.com/studio/g/sample"
          clientPhone="+256700000000"
        />
      </LookOnly>
    </div>
  );
}
