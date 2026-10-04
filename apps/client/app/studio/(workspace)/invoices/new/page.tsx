import Link from "next/link";

import { DocumentEditor } from "@repo/ui/billing/DocumentEditor";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "New invoice — My Studio" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { scope } = await requireStudio();
  const [clients, onSale, { client }] = await Promise.all([customers.list(scope), offerings.list(scope), searchParams]);

  return (
    <>
      <Link href="/studio/invoices" className="text-xs font-medium text-brand-600 hover:underline">
        ← Invoices
      </Link>
      {clients.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Add a client first:{" "}
          <Link href="/studio/clients/new" className="font-medium text-brand-600 underline">
            New client
          </Link>
        </p>
      ) : (
        <DocumentEditor
          kind="invoice"
          customers={clients.map((c) => ({ id: c.id, name: c.name }))}
          offerings={onSale}
          presetCustomerId={clients.some((c) => c.id === client) ? client : undefined}
          scope={scope}
          basePath="/studio/invoices"
        />
      )}
    </>
  );
}
