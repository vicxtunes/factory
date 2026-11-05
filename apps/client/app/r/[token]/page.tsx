import { notFound } from "next/navigation";

import { ReceiptPdf } from "@repo/ui/billing/DocumentPdf";
import { shareTokenSchema } from "@repo/lib/billing/core";

import { BrandStyle } from "../../brand-style";
import { load } from "./load";

// A payment's receipt link (client.<domain>/r/<token>). No sign-in: holding
// the link is the permission, and it shows only this one receipt, as its PDF. View only.

export const dynamic = "force-dynamic";
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
