import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectForm } from "@repo/ui/projects/ProjectControls";
import { customers } from "@repo/lib/customers/server";
import { canEditProject, projectIdSchema } from "@repo/lib/projects/core";
import { projects } from "@repo/lib/projects/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Edit project — My Studio" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  const id = projectIdSchema.safeParse((await params).id);
  const view = id.success ? await projects.get(scope, id.data) : null;
  if (!view) notFound();
  const p = view.project;
  if (!canEditProject(p.status)) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
        This project is completed.{" "}
        <Link href={`/studio/projects/${p.id}`} className="font-medium text-brand-600 underline">
          Back to it
        </Link>
      </p>
    );
  }
  const clients = await customers.list(scope);
  const choices = clients.some((c) => c.id === p.customerId) ? clients : [...clients, { id: p.customerId, name: `${p.customerName} (archived)` }];

  return (
    <>
      <Link href={`/studio/projects/${p.id}`} className="text-xs font-medium text-brand-600 hover:underline">
        ← {p.title}
      </Link>
      <ProjectForm project={p} customers={choices.map((c) => ({ id: c.id, name: c.name }))} basePath="/studio/projects" />
    </>
  );
}
