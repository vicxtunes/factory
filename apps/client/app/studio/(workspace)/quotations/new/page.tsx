import Link from "next/link";
import { BackLink } from "@repo/ui/navigation/back";

import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { DocumentEditor } from "@repo/ui/billing/DocumentEditor";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "New quotation · My Business" };

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { scope } = await requireStudio();
  const { client } = await searchParams;

  return (
    <>
      <BackLink href="/studio/quotations" className="text-xs font-medium text-brand-600 hover:underline">
        ← Quotations
      </BackLink>
      <Loading skeleton={<FormSkeleton />}>
        <Form scope={scope} client={client} />
      </Loading>
    </>
  );
}

async function Form({ scope, client }: { scope: TenantScope; client?: string }) {
  const [clients, onSale] = await Promise.all([customers.list(scope), offerings.onSale(scope)]);
  return clients.length === 0 ? (
    <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
      Add a client first:{" "}
      <Link href="/studio/clients/new" className="font-medium text-brand-600 underline">
        New client
      </Link>
    </p>
  ) : (
    <DocumentEditor
      kind="quotation"
      customers={clients.map((c) => ({ id: c.id, name: c.name }))}
      offerings={onSale}
      presetCustomerId={clients.some((c) => c.id === client) ? client : undefined}
      scope={scope}
      basePath="/studio/quotations"
    />
  );
}
