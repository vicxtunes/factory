import { ProjectForm } from "@repo/ui/projects/ProjectControls";
import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { UrlSheet } from "@repo/ui/UrlSheet";
import { customers } from "@repo/lib/customers/server";
import type { Project } from "@repo/lib/projects/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

// A project's forms in the sheet: "New project" over the list (?new), "Edit"
// over the project (?edit). Saving opens the project.

export function NewProjectSheet({ scope }: { scope: TenantScope }) {
  return (
    <UrlSheet title="New project" closeHref="/studio/projects">
      <Loading skeleton={<FormSkeleton />}>
        <Form scope={scope} />
      </Loading>
    </UrlSheet>
  );
}

export function EditProjectSheet({ scope, project }: { scope: TenantScope; project: Project }) {
  return (
    <UrlSheet title="Edit project" closeHref={`/studio/projects/${project.id}`}>
      <Loading skeleton={<FormSkeleton />}>
        <Form scope={scope} project={project} />
      </Loading>
    </UrlSheet>
  );
}

async function Form({ scope, project }: { scope: TenantScope; project?: Project }) {
  const clients = await customers.list(scope);
  // Editing: keep the project's own client choosable even if they've since been archived.
  const choices = !project || clients.some((c) => c.id === project.customerId) ? clients : [...clients, { id: project.customerId, name: `${project.customerName} (archived)` }];
  return <ProjectForm project={project} customers={choices.map((c) => ({ id: c.id, name: c.name }))} basePath="/studio/projects" />;
}
