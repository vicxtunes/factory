import { AlbumCard } from "@repo/ui/AlbumCard";

import { ALBUMS } from "../_data/photos";

export default function AlbumCardSingle() {
  const a = ALBUMS[0];
  return (
    <div className="max-w-64">
      <AlbumCard title={a.title} client={a.client} cover={a.cover} count={a.count} status={a.status} />
    </div>
  );
}
