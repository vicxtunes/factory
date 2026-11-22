import { notFound } from "next/navigation";
import sharp from "sharp";

import { StudioHero } from "@repo/ui/studio-portal/StudioHero";
import { offerings } from "@repo/lib/offerings/server";
import { photos } from "@repo/lib/photos/server";
import { studioAccess } from "@repo/lib/studio-access/server";
import { studioAtSlug } from "@repo/lib/studio-portal/server";

import { BrandStyle } from "../brand-style";

export const dynamic = "force-dynamic";

// The studio hero on its own, to work on it (owner, 2026-11-18): /hero?studio=<slug>.
export default async function HeroPage({ searchParams }: { searchParams: Promise<{ studio?: string }> }) {
  const slug = (await searchParams).studio ?? "amber-mediaug";
  const at = await studioAtSlug(slug);
  if (!at) notFound();
  const [categories, albums, logoUrl] = await Promise.all([
    offerings.showroom(at.scope, "service"),
    photos.albums(at.scope, true).catch(() => []),
    studioAccess.logoUrl(at.studio.logoKey),
  ]);
  const services = categories.flatMap((c) => c.services);
  const galleries = await Promise.all(services.map((s) => photos.serviceGallery(at.scope, s.id).catch(() => null)));
  // Each album's photos, its cover first; then every album's first, every
  // album's second… so the six tiles spread across albums before repeating one.
  const lists = await Promise.all(
    [...albums, ...galleries.filter((g) => g !== null)].map(async (a) => {
      const all = await photos.photos(at.scope, a.id).catch(() => []);
      return [...all.filter((p) => p.id === a.coverPhotoId), ...all.filter((p) => p.id !== a.coverPhotoId)];
    }),
  );
  // The same picture uploaded to two albums is two files of the same size: one tile only.
  const seen = new Set<number>();
  const pictures: { small: string; large: string }[] = [];
  for (let i = 0; pictures.length < 6 && lists.some((l) => i < l.length); i++) {
    for (const p of lists.map((l) => l[i])) {
      if (!p || seen.has(p.bytes) || pictures.length === 6) continue;
      seen.add(p.bytes);
      pictures.push({ small: p.thumbUrl, large: p.largeUrl });
    }
  }

  return (
    <>
      <BrandStyle color={at.studio.brandColor} />
      <StudioHero
        name={at.studio.name}
        headline={categories.map((c) => c.name)}
        services={services.map((s) => s.name)}
        phone={at.studio.phone}
        email={at.studio.email}
        address={at.studio.address}
        location={at.studio.location}
        // While designing: sample links where the studio has none yet.
        socials={Object.values(at.studio.socials).some(Boolean) ? at.studio.socials : { instagram: "#", tiktok: "#", facebook: "#", linkedin: "#" }}
        logoUrl={logoUrl ? await whiteLogo(logoUrl) : null}
        photos={pictures}
        bookHref={`/${at.redirectTo ?? slug}`}
      />
    </>
  );
}

// The logo in pure white with no background, whatever it was uploaded on: its
// dark shapes become white, its light background see-through (the in-between
// fades, so edges stay smooth). Falls back to the logo as it is.
async function whiteLogo(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ height: 240, withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const light = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const ink = Math.max(0, Math.min(1, (225 - light) / 90));
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(ink * data[i + 3]);
    }
    const png = await sharp(data, { raw: info }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return url;
  }
}
