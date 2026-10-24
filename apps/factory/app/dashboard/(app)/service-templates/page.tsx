import { TemplatesManager } from "@repo/ui/offerings/TemplatesManager";
import { serviceTemplates } from "@repo/lib/offerings/adapters/supabase/templates";
import { requireStudiosOversight } from "@repo/lib/studios/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Service templates" };

// Ready-made services with their packages that businesses add while setting
// up or from Packages & Services (packages/lib/offerings, "Templates"). A
// business gets its own copy: changing a template here changes no business.
export default async function ServiceTemplatesPage() {
  await requireStudiosOversight();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Ready-made services with packages, for businesses to start from. Each business gets its own copy to change: editing a template here changes no
        business. Prices are in UGX; a business in another currency gets them as “Price on request”.
      </p>
      <TemplatesManager templates={await serviceTemplates()} />
    </div>
  );
}
