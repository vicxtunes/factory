import { Suspense } from "react";

import { Skeleton } from "@repo/ui/Skeleton";
import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { LogoUploader } from "@repo/ui/studio-access/LogoUploader";
import { StudioAddressForm } from "@repo/ui/studio-portal/StudioAddressForm";
import { BrandColorPicker } from "@repo/ui/studios/BrandColorPicker";
import { StudioProfileForm } from "@repo/ui/studios/StudioProfileForm";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { studioAccess } from "@repo/lib/studio-access/server";
import { slugFromName } from "@repo/lib/studio-portal/core";
import { portal } from "@repo/lib/studio-portal/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { Studio } from "@repo/lib/studios/core";

export const metadata = { title: "Business profile · My Business" };

export default async function StudioProfilePage() {
  const { studio } = await requireStudio();

  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">{studio.name}</h2>
        <p className="text-sm text-muted">
          Your business details, shown on your quotations, invoices and receipts, and on your public page.
        </p>
      </div>
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
        <p className="text-sm font-semibold">Logo</p>
        <Suspense fallback={<Skeleton className="h-24 w-24 rounded-2xl" />}>
          <Logo studio={studio} />
        </Suspense>
      </section>
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
        <div>
          <p className="text-sm font-semibold">Brand color</p>
          <p className="text-sm text-muted">Your public page, its buttons and links wear it, with your logo.</p>
        </div>
        <BrandColorPicker current={studio.brandColor} />
      </section>
      <Loading skeleton={<FormSkeleton fields={1} />}>
        <Address studio={studio} />
      </Loading>
      <StudioProfileForm profile={studio} />
    </>
  );
}

async function Logo({ studio }: { studio: Studio }) {
  return <LogoUploader logoUrl={await studioAccess.logoUrl(studio.logoKey)} />;
}

async function Address({ studio }: { studio: Studio }) {
  const current = await portal.currentSlug(studio.id);
  return <StudioAddressForm current={current} suggested={slugFromName(studio.name)} origin={clientUrl("/").replace(/\/$/, "")} />;
}
