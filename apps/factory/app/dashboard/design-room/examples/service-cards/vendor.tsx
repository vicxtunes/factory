"use client";

import { ServiceTiles } from "@repo/ui/vendors/ServiceTiles";

const photo = (key: string) => `/design-room/photos/${key}.svg`;

// A vendor's services as cards (name, price told big, what's included, the
// samples): tap one for the work first, then (on a studio's view) hiring.
export default function ServiceCardsVendor() {
  return (
    <ServiceTiles
      offers={[
        {
          id: "a",
          name: "Wedding edits",
          description: "Our warm, natural look.",
          price: 5_000,
          unit: "photo",
          included: ["Colour & skin retouch", "Delivered in 5 days", "Two rounds of changes"],
          sampleUrls: [photo("garden-arch"), photo("forest-morning"), photo("city-dusk")],
        },
        { id: "b", name: "Album design", description: null, price: 450_000, unit: "project", included: ["40 pages"], sampleUrls: [photo("autumn-road")] },
        { id: "c", name: "Retouch on request", description: null, price: null, unit: null, included: [], sampleUrls: [] },
      ]}
      hire={{ vendorId: "v", projects: [{ id: "p", title: "Grace & John wedding", meta: "Grace · 12 Dec" }] }}
    />
  );
}
