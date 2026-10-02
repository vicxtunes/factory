import type { MetadataRoute } from "next";

import { APP_IDENTITY as app } from "./identity";

export default function manifest(): MetadataRoute.Manifest {
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
