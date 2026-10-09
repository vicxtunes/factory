import { DEFAULT_BRAND_COLOR } from "@repo/lib/studios/core";
import { studioAtSlug } from "@repo/lib/studio-portal/server";

// A studio's own install manifest (see ../layout.tsx): added to a home screen,
// its public page is an app of its own, with its name, icon and color, and
// opens on its showroom. Its id is the studio's address, never Aming's.

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = decodeURIComponent((await params).slug);
  const at = await studioAtSlug(slug);
  if (!at) return new Response(null, { status: 404 });
  const home = `/${encodeURIComponent(slug)}`;
  const icon = { src: `${home}/logo`, sizes: "512x512", type: "image/png" };
  return Response.json(
    {
      id: home,
      name: at.studio.name,
      short_name: at.studio.name,
      start_url: home,
      scope: home,
      display: "standalone",
      background_color: "#f9fafb",
      theme_color: at.studio.brandColor ?? DEFAULT_BRAND_COLOR,
      icons: [
        { ...icon, purpose: "any" },
        { ...icon, purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
