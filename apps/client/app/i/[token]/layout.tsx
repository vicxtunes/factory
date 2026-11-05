import type { Metadata, Viewport } from "next";

import { LINK_GONE_METADATA, LINK_GONE_VIEWPORT, studioDocumentMetadata, studioDocumentViewport } from "../../studio-document-head";
import { load } from "./load";

type Props = { params: Promise<{ token: string }> };

// The studio's brand in the tab and the share preview, never Aming's; set
// here, not in the page, so a dead link keeps it neutral too.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).token);
  return found ? studioDocumentMetadata(found.scope.tenantId, found.issuer, "Invoice") : LINK_GONE_METADATA;
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const found = await load((await params).token);
  return found ? studioDocumentViewport(found.issuer) : LINK_GONE_VIEWPORT;
}

export default function DocumentLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
