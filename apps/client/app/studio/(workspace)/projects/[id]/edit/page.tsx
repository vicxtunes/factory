import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";

import { ProjectForm } from "@repo/ui/projects/ProjectControls";
import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { customers } from "@repo/lib/customers/server";
import { projectIdSchema, type Project } from "@repo/lib/projects/core";
import { projects } from "@repo/lib/projects/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Edit project · My Business" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio("projects");
  const id = projectIdSchema.safeParse((await params).id);
  const view = id.success ? await projects.get(scope, id.data) : null;
  if (!view) notFound();
  const p = view.project;

  return (
    <>
      <BackLink href={`/studio/projects/${p.id}`} className="text-xs font-medium text-brand-600 hover:underline">
        ← {p.title}
      </BackLink>
      <Loading skeleton={<FormSkeleton />}>
        <Form scope={scope} p={p} />
      </Loading>
    </>
  );
}

async function Form({ scope, p }: { scope: TenantScope; p: Project }) {
  const clients = await customers.list(scope);
  const choices = clients.some((c) => c.id === p.customerId) ? clients : [...clients, { id: p.customerId, name: `${p.customerName} (archived)` }];

  return <ProjectForm project={p} customers={choices.map((c) => ({ id: c.id, name: c.name }))} basePath="/studio/projects" />;
}
