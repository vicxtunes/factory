import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ReceiptPdf } from "@repo/ui/billing/DocumentPdf";
import { shareTokenSchema } from "@repo/lib/billing/core";
import { invoices } from "@repo/lib/billing/server";

import { BrandStyle } from "../../brand-style";
import { studioDocumentMetadata, studioDocumentViewport } from "../../studio-document-head";

// A payment's receipt link (client.<domain>/r/<token>). No sign-in: holding
// the link is the permission, and it shows only this one receipt, as its PDF. View only.

export const dynamic = "force-dynamic";
// Read once per request, for the head and the page.
const load = cache(async (token: string) => {
  const parsed = shareTokenSchema.safeParse(token);
  return parsed.success ? invoices.receiptByLink(parsed.data) : null;
});

type Params = { params: Promise<{ token: string }> };

// The studio's brand in the tab and the share preview, never Aming's (../../studio-document-head.ts).
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const found = await load((await params).token);
  return found ? studioDocumentMetadata(found.scope.tenantId, found.issuer, "Receipt") : { title: { absolute: "Receipt" }, robots: { index: false, follow: false } };
}

export async function generateViewport({ params }: Params): Promise<Viewport> {
  const found = await load((await params).token);
  return found ? studioDocumentViewport(found.issuer) : {};
}

export default async function ReceiptLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const parsed = shareTokenSchema.safeParse((await params).token);
  const found = parsed.success ? await load(parsed.data) : null;
  if (!found) notFound();
  const { currency, locale, timeZone } = found.scope;

  return (
    <>
      <BrandStyle color={found.issuer.color} />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
        <ReceiptPdf receipt={found.receipt} issuer={found.issuer} scope={{ currency, locale, timeZone }} />
      </main>
    </>
  );
}
