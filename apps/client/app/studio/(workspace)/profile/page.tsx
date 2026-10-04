import { LogoUploader } from "@repo/ui/studio-access/LogoUploader";
import { StudioAddressForm } from "@repo/ui/studio-portal/StudioAddressForm";
import { StudioProfileForm } from "@repo/ui/studios/StudioProfileForm";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { studioAccess } from "@repo/lib/studio-access/server";
import { slugFromName } from "@repo/lib/studio-portal/core";
import { portal } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Studio profile — My Studio" };

export default async function StudioProfilePage() {
  const { studio } = await requireStudio();
  const [current, logoUrl] = await Promise.all([portal.currentSlug(studio.id), studioAccess.logoUrl(studio.logoKey)]);

  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">{studio.name}</h2>
        <p className="text-sm text-muted">
          Your studio&apos;s business details, shown on your quotations, invoices and receipts, and on your public page.
        </p>
      </div>
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
        <p className="text-sm font-semibold">Logo</p>
        <LogoUploader logoUrl={logoUrl} />
      </section>
      <StudioAddressForm current={current} suggested={slugFromName(studio.name)} origin={clientUrl("/").replace(/\/$/, "")} />
      <StudioProfileForm profile={studio} />
    </>
  );
}
