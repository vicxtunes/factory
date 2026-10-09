import { ImageResponse } from "next/og";

import { studioAccess } from "@repo/lib/studio-access/server";
import { DEFAULT_BRAND_COLOR, studioInitials } from "@repo/lib/studios/core";
import { studioAtSlug } from "@repo/lib/studio-portal/server";

// A studio's icon at a stable address (tab, home screen, install manifest; see
// ../layout.tsx): its logo on white, else its initials on its color. Square
// PNG, as home screens want. The logo itself is private, behind a link that
// expires within the hour, so it's fetched fresh each time.

const EDGE = 512;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const at = await studioAtSlug(decodeURIComponent((await params).slug));
  if (!at) return new Response(null, { status: 404 });
  const logoUrl = await studioAccess.logoUrl(at.studio.logoKey);
  const box = { display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" } as const;
  return new ImageResponse(
    logoUrl ? (
      <div style={{ ...box, background: "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" style={{ width: "76%", height: "76%", objectFit: "contain" }} />
      </div>
    ) : (
      <div style={{ ...box, background: at.studio.brandColor ?? DEFAULT_BRAND_COLOR, color: "#ffffff", fontSize: 220, fontWeight: 700 }}>
        {studioInitials(at.studio.name)}
      </div>
    ),
    { width: EDGE, height: EDGE, headers: { "cache-control": "public, max-age=3600" } },
  );
}
