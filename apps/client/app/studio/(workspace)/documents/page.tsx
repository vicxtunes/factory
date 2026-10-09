import Link from "next/link";

import { DocumentSettingsForm } from "@repo/ui/billing/DocumentSettingsForm";
import { InvoicePdf } from "@repo/ui/billing/DocumentPdf";
import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import type { Invoice } from "@repo/lib/billing/core";
import { documentIssuer } from "@repo/lib/billing/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Document settings · My Business" };

// How the studio's quotations, invoices and receipts look and close. Their
// logo and color come from the Business profile; here: how to pay, terms and
// a signature. A sample invoice shows them as the client will see them.
export default async function DocumentSettingsPage() {
  const { scope, studio } = await requireStudio();
  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">Document settings</h2>
        <p className="text-sm text-muted">
          What your quotations, invoices and receipts print. Your logo and color come from your{" "}
          <Link href="/studio/profile" className="font-medium text-brand-600 hover:underline">
            Business profile
          </Link>
          .
        </p>
      </div>
      <Loading skeleton={<FormSkeleton fields={4} />}>
        <Settings studioId={studio.id} scope={scope} />
      </Loading>
    </>
  );
}

async function Settings({ studioId, scope }: { studioId: string; scope: TenantScope }) {
  const issuer = await documentIssuer(studioId);
  const { terms, paymentInstructions, signatureName, signature } = issuer;
  return (
    <>
      <DocumentSettingsForm settings={{ terms, paymentInstructions, signatureName, signature }} />
      <section className="space-y-3">
        <p className="text-sm font-semibold">Sample invoice</p>
        <InvoicePdf
          invoice={sampleInvoice(localDate(new Date(), scope.timeZone))}
          issuer={issuer}
          scope={{ currency: scope.currency, locale: scope.locale, timeZone: scope.timeZone }}
        />
      </section>
    </>
  );
}

/** A made-up invoice with something left to pay, so every part of the layout shows. */
function sampleInvoice(today: string): Invoice {
  const line = (description: string, inclusions: string[], unitPrice: number) => ({
    offeringId: null,
    description,
    inclusions,
    quantity: 1,
    unitPrice,
    discount: null,
    netUnitPrice: unitPrice,
    total: unitPrice,
  });
  const lines = [line("Wedding package", ["Full-day coverage", "300 edited photos", "Online gallery"], 2_500_000), line("Photobook, 30 × 30", [], 450_000)];
  const total = lines.reduce((t, l) => t + l.total, 0);
  return {
    id: "sample",
    number: "INV-0001",
    customerId: "sample",
    billTo: { name: "Sample Client", phone: "+256 700 000000", email: null },
    issuedAt: today,
    dueDate: null,
    status: "partially_paid",
    subtotal: total,
    discount: 0,
    total,
    paid: 1_000_000,
    balance: total - 1_000_000,
    shoot: null,
    notes: null,
    sourceId: null,
    voidedAt: null,
    voidReason: null,
    shareToken: "",
    lines,
    payments: [],
  };
}
