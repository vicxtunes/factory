"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { FileBrowser } from "@repo/ui/files/FileBrowser";
import { SAMPLE_PEOPLE, SAMPLE_SHARES, sampleListing } from "@repo/ui/files/samples";

const SCOPE = { locale: "en-UG", timeZone: "Africa/Kampala" };

// Open folders, search, switch tiles and list, drop files on it. Saving
// (new folder, rename, move, delete, upload, sharing) goes to the server and answers
// with its error here, since this isn't a business.
function Drive() {
  return (
    <FileBrowser
      listing={sampleListing(useSearchParams().get("folder")) ?? sampleListing(null)!}
      basePath={usePathname()}
      scope={SCOPE}
      via={{ as: "studio" }}
      sharing={{ shares: SAMPLE_SHARES, people: SAMPLE_PEOPLE, linkBase: "https://client.example/sample-business/f/" }}
    />
  );
}

export default function FileBrowserDrive() {
  return (
    <Suspense>
      <Drive />
    </Suspense>
  );
}
