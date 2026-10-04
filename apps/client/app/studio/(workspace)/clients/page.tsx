import Link from "next/link";

import { CustomersList } from "@repo/ui/customers/CustomersList";
import { customers } from "@repo/lib/customers/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Clients · My Studio" };

export default async function StudioClientsPage() {
  const { scope } = await requireStudio();
  const [active, archived] = await Promise.all([customers.list(scope), customers.list(scope, true)]);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">The people your studio works for. One profile per person keeps their whole history together.</p>
        <Link
          href="/studio/clients/new"
          className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm text-white shadow-theme-xs hover:bg-brand-600"
        >
          Add client
        </Link>
      </div>
      <CustomersList active={active} archived={archived} basePath="/studio/clients" />
    </>
  );
}
