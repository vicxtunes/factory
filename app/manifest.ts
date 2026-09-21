import type { MetadataRoute } from "next";

import { getAppIdentity } from "@/lib/app-identity";

// Dynamic (reads the request host) so client.* and factory.* install as two
// separately named apps — see lib/app-identity.ts.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const app = await getAppIdentity();
  return {
    id: app.id,
    name: app.name,
    short_name: app.shortName,
    description: app.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#f67413",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
