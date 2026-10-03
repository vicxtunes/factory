import { StudiosTable } from "@repo/ui/studios/StudiosTable";
import { requireStudiosOversight, studios } from "@repo/lib/studios/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function StudiosPage() {
  await requireStudiosOversight();
  const [list, scope] = await Promise.all([studios.list(), resolveTenantScope()]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Clients running their own photography studio in the system.</p>
      <StudiosTable studios={list} scope={scope} />
    </div>
  );
}
