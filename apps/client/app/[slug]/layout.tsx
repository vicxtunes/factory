import type { Metadata, Viewport } from "next";

import { DEFAULT_BRAND_COLOR } from "@repo/lib/studios/core";
import { studioAtSlug } from "@repo/lib/studio-portal/server";

import { BrandStyle } from "../brand-style";

// A studio's public pages carry its brand, never Aming's: its name in the tab
// and on the home screen, its logo as the icon (./logo), its own install
// manifest, and its color over Aming's orange (../brand-style.tsx). A
// product's page at the same address
// (./page.tsx) stays Aming's: this layout leaves it alone.

type Props = { params: Promise<{ slug: string }> };

const studioOf = async (params: Props["params"]) => {
  const slug = decodeURIComponent((await params).slug);
  const at = await studioAtSlug(slug);
  return at && { ...at, slug };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const at = await studioOf(params);
  if (!at) return {};
  const { name, address, phone } = at.studio;
  const description = [address, phone].filter(Boolean).join(" · ") || name;
  const home = `/${encodeURIComponent(at.slug)}`;
  const icon = `${home}/logo`;
  return {
    title: { default: name, template: `%s - ${name}` },
    description,
    applicationName: name,
    appleWebApp: { capable: true, statusBarStyle: "default", title: name },
    openGraph: { siteName: name, title: name, description, type: "website" },
    icons: { icon, apple: icon },
    manifest: `${home}/manifest.webmanifest`,
  };
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const at = await studioOf(params);
  return at ? { themeColor: at.studio.brandColor ?? DEFAULT_BRAND_COLOR } : {};
}

export default async function StudioLayout({ children, params }: Props & { children: React.ReactNode }) {
  const at = await studioOf(params);
  if (!at) return children;
  return (
    <>
      <BrandStyle color={at.studio.brandColor} />
      {children}
    </>
  );
}
