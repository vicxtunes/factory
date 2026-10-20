import Link from "next/link";

import { buttonClass } from "@repo/ui/Button";
import { CustomersList } from "@repo/ui/customers/CustomersList";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { customers } from "@repo/lib/customers/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { NewClientSheet } from "./sheets";

export const metadata = { title: "Clients · My Business" };

export default async function StudioClientsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { scope } = await requireStudio("clients");
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">The people your business works for. One profile per person keeps their whole history together.</p>
        <Link href="/studio/clients?new" scroll={false} className={`${buttonClass()} shrink-0`}>
          Add client
        </Link>
      </div>
      <Loading skeleton={<RowsSkeleton />}>
        <Clients scope={scope} />
      </Loading>
      {(await searchParams).new !== undefined ? <NewClientSheet /> : null}
    </>
  );
}

async function Clients({ scope }: { scope: TenantScope }) {
  const [active, archived] = await Promise.all([customers.list(scope), customers.list(scope, true)]);
  return <CustomersList active={active} archived={archived} basePath="/studio/clients" />;
}
