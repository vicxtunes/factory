import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerArchiveButton, CustomerForm } from "@repo/ui/customers/CustomerForm";
import { customerIdSchema } from "@repo/lib/customers/core";
import { customers } from "@repo/lib/customers/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Client — My Studio" };

export default async function StudioClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = customerIdSchema.safeParse((await params).id);
  const customer = id.success ? await customers.get(scope, id.data) : null;
  if (!customer) notFound();

  return (
    <>
      <div>
        <Link href="/studio/clients" className="text-xs font-medium text-brand-600 hover:underline">
          ← Clients
        </Link>
        <h2 className="mt-1 text-xl font-semibold">
          {customer.name}
          {customer.archivedAt ? <span className="ml-2 align-middle text-xs font-normal text-muted">(archived)</span> : null}
        </h2>
      </div>
      <CustomerForm key={customer.id} customer={customer} basePath="/studio/clients" />
      <CustomerArchiveButton customer={customer} />
    </>
  );
}
