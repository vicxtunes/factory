import Link from "next/link";

import { ProjectForm } from "@repo/ui/projects/ProjectControls";
import { customers } from "@repo/lib/customers/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "New project — My Studio" };

export default async function NewProjectPage() {
  const { scope } = await requireStudio();
  const clients = await customers.list(scope);

  return (
    <>
      <Link href="/studio/projects" className="text-xs font-medium text-brand-600 hover:underline">
        ← Projects
      </Link>
      <ProjectForm customers={clients.map((c) => ({ id: c.id, name: c.name }))} basePath="/studio/projects" />
    </>
  );
}
