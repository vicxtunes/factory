// Sample photos for the Media drafts (PhotoGrid, Lightbox, PhotoCarousel,
// CompareSlider, AlbumCard) — illustrated SVG scenes in public/design-room/
// photos/, in landscape, portrait and square, so layouts get mixed shapes.

export interface Photo {
  key: string;
  src: string;
  alt: string;
  width: number;
  height: number;
}

export const PHOTOS: Photo[] = [
  { key: "sunset-lake", src: "/design-room/photos/sunset-lake.svg", alt: "Sunset over the lake", width: 1500, height: 1000 },
  { key: "ocean-cliffs", src: "/design-room/photos/ocean-cliffs.svg", alt: "Cliffs above the ocean", width: 1000, height: 1500 },
  { key: "forest-morning", src: "/design-room/photos/forest-morning.svg", alt: "Forest at morning", width: 1500, height: 1000 },
  { key: "desert-dunes", src: "/design-room/photos/desert-dunes.svg", alt: "Desert dunes", width: 1500, height: 1000 },
  { key: "city-dusk", src: "/design-room/photos/city-dusk.svg", alt: "City at dusk", width: 1000, height: 1000 },
  { key: "meadow", src: "/design-room/photos/meadow.svg", alt: "Wildflower meadow", width: 1000, height: 1500 },
  { key: "snow-peaks", src: "/design-room/photos/snow-peaks.svg", alt: "Snowy peaks", width: 1500, height: 1000 },
  { key: "harbour", src: "/design-room/photos/harbour.svg", alt: "Harbour boats", width: 1000, height: 1000 },
  { key: "autumn-road", src: "/design-room/photos/autumn-road.svg", alt: "Autumn road", width: 1000, height: 1500 },
  { key: "night-sky", src: "/design-room/photos/night-sky.svg", alt: "Night sky", width: 1500, height: 1000 },
  { key: "tea-fields", src: "/design-room/photos/tea-fields.svg", alt: "Tea fields", width: 1500, height: 1000 },
  { key: "garden-arch", src: "/design-room/photos/garden-arch.svg", alt: "Garden archway", width: 1000, height: 1000 },
];

/** Original (flat, unedited) versions for the before/after compare. */
export const BEFORE = {
  "sunset-lake": "/design-room/photos/sunset-lake-before.svg",
  harbour: "/design-room/photos/harbour-before.svg",
};

export const photo = (key: string) => PHOTOS.find((p) => p.key === key)!;

export const ALBUMS = [
  { id: "nakato", title: "Nakato & Daniel — Wedding", client: "Sarah Nakato", cover: photo("sunset-lake").src, count: 40, status: "proofing" },
  { id: "okello", title: "Okello family portraits", client: "James Okello", cover: photo("garden-arch").src, count: 24, status: "approved" },
  { id: "kampala", title: "Kampala Prints — catalogue", client: "Kampala Prints Ltd", cover: photo("city-dusk").src, count: 120, status: "printed" },
  { id: "safari", title: "Safari trip 2026", client: "Grace Mukasa", cover: photo("desert-dunes").src, count: 0, status: "draft" },
] as const;
