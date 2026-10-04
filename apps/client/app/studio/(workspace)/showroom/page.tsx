import Link from "next/link";

import { NewAlbumForm } from "@repo/ui/photos/AlbumControls";
import { UsageBar } from "@repo/ui/photos/UsageBar";
import { photos } from "@repo/lib/photos/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Showroom · My Studio" };

export default async function StudioShowroomPage() {
  const { scope } = await requireStudio();
  const [albums, usage] = await Promise.all([photos.albums(scope), photos.usage(scope)]);

  return (
    <>
      <p className="text-sm text-muted">
        Your best work, in albums. Public albums show on your studio&apos;s page in a 3D showroom, and each has its own address to share.
      </p>
      <UsageBar usage={usage} />
      <NewAlbumForm basePath="/studio/showroom" />
      {albums.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No albums yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {albums.map((a) => (
            <li key={a.id}>
              <Link href={`/studio/showroom/${a.id}`} className="block overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs hover:bg-background">
                {a.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage link, already resized
                  <img src={a.coverUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-gray-100 text-xs text-muted dark:bg-white/5">No photos</div>
                )}
                <div className="p-3">
                  <p className="truncate font-medium">{a.title}</p>
                  <p className="text-xs text-muted">
                    {a.photoCount} photo{a.photoCount === 1 ? "" : "s"} · {a.isPublic ? "Public" : "Hidden"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
