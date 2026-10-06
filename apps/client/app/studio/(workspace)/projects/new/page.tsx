import Link from "next/link";

import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { ProjectForm } from "@repo/ui/projects/ProjectControls";
import { customers } from "@repo/lib/customers/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "New project · My Business" };

export default async function NewProjectPage() {
  const { scope } = await requireStudio();

  return (
    <>
      <Link href="/studio/projects" className="text-xs font-medium text-brand-600 hover:underline">
        ← Projects
      </Link>
      <Loading skeleton={<FormSkeleton />}>
        <Form scope={scope} />
      </Loading>
    </>
  );
}

async function Form({ scope }: { scope: TenantScope }) {
  const clients = await customers.list(scope);

  return <ProjectForm customers={clients.map((c) => ({ id: c.id, name: c.name }))} basePath="/studio/projects" />;
}
