"use client";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { sampleListing } from "@repo/ui/files/samples";

// "Raw footage" has nothing in it.
export default function FileBrowserEmpty() {
  return <FileBrowser listing={sampleListing("f-raw")!} basePath="#" scope={{ locale: "en-UG", timeZone: "Africa/Kampala" }} via={{ as: "studio" }} />;
}
