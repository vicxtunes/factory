import type { Metadata, Viewport } from "next";

import type { Issuer } from "@repo/lib/billing/core";
import { portal } from "@repo/lib/studio-portal/server";

// The head of a studio's document link (/q, /i, /r; set in each one's layout, which a 404 keeps): the studio's brand,
// never Aming's. Its name in the tab, the share preview (WhatsApp…) and the
// home screen, its icon and install manifest (from its own pages, ./[slug]),
// and its color as the browser's.

export async function studioDocumentMetadata(tenantId: string, issuer: Issuer, title: string): Promise<Metadata> {
  const slug = await portal.currentSlug(tenantId).catch(() => null);
  const home = slug ? `/${encodeURIComponent(slug)}` : null;
  const full = `${title} · ${issuer.name}`;
  const description = [issuer.address, issuer.phone].filter(Boolean).join(" · ") || issuer.name;
  return {
    title: { absolute: full },
    description,
    applicationName: issuer.name,
    appleWebApp: { capable: true, statusBarStyle: "default", title: issuer.name },
    openGraph: { siteName: issuer.name, title: full, description, type: "website" },
    // Without the studio's own icon, none rather than Aming's.
    icons: home ? { icon: `${home}/logo`, apple: `${home}/logo` } : null,
    manifest: home ? `${home}/manifest.webmanifest` : null,
    // Private to whoever holds the link: keep it out of search engines.
    robots: { index: false, follow: false },
  };
}

// A dead link: no one's brand (Next drops the page's own head for a 404, so
// without this Aming's defaults would show).
export const LINK_GONE_METADATA: Metadata = {
  title: { absolute: "Link not available" },
  description: null,
  applicationName: null,
  appleWebApp: null,
  openGraph: null,
  twitter: null,
  icons: null,
  manifest: null,
  robots: { index: false, follow: false },
};

// ...and a plain white browser bar instead of Aming's orange.
export const LINK_GONE_VIEWPORT: Viewport = { themeColor: "#ffffff" };

export const studioDocumentViewport = (issuer: Issuer): Viewport => ({ themeColor: issuer.color });
