"use client";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { sampleListing } from "@repo/ui/files/samples";

// A client choosing their album photos (a "choose" task): ♥ on each photo, a
// counter, and Send my choice. Picking goes to the server, so here it answers
// with its error.
export default function FileBrowserChoosing() {
  const listing = sampleListing("f-nakato")!;
  const photos = listing.files.filter((f) => f.contentType.startsWith("image/"));
  return (
    <FileBrowser
      listing={{ ...listing, path: listing.path.slice(1), rights: { add: false, change: false, download: false, share: false }, addable: { top: false, folders: [] } }}
      basePath="#"
      scope={{ locale: "en-UG", timeZone: "Africa/Kampala" }}
      via={{ as: "client", slug: "sample-business" }}
      topLabel="Shared with you"
      task={{
        id: "sample-task",
        title: "Choose your album photos",
        kind: "choose",
        pickMin: 2,
        pickMax: 3,
        dueOn: "2026-10-30",
        done: false,
        picks: photos.slice(0, 1).map((f) => f.id),
        mine: true,
        forName: null,
      }}
    />
  );
}
