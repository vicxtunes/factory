"use client";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { sampleListing } from "@repo/ui/files/samples";

// What a client sees of a folder shared with them as a viewer, with
// downloads: no New folder, Upload, Rename, Move or Delete.
export default function FileBrowserSharedViewer() {
  const listing = sampleListing("f-nakato")!;
  return (
    <FileBrowser
      listing={{ ...listing, path: listing.path.slice(1), rights: { add: false, change: false, download: true, share: false }, addable: { top: false, folders: [] } }}
      basePath="#"
      scope={{ locale: "en-UG", timeZone: "Africa/Kampala" }}
      via={{ as: "client", slug: "sample-business" }}
      topLabel="Shared with you"
    />
  );
}
