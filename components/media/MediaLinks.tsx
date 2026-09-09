import type { OrderItemMedia } from "@/lib/types";

// Renders an item's uploaded Cloudinary files. Falls back to the legacy
// pasted media_link (item-level, then order-level) for orders created
// before this feature existed, so old rows keep working with no data
// migration.
export function MediaLinks({
  media,
  legacyLink,
}: {
  media: OrderItemMedia[];
  legacyLink?: string | null;
}) {
  if (media.length > 0) {
    return (
      <div className="flex flex-wrap gap-2">
        {media.map((file) => (
          <a
            key={file.id}
            href={file.secure_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-3 text-xs"
          >
            {file.file_name}
          </a>
        ))}
      </div>
    );
  }

  if (legacyLink) {
    return (
      <a
        href={legacyLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-3 text-xs"
      >
        View photos
      </a>
    );
  }

  return null;
}
