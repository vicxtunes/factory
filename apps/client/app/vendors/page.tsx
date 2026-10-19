import { HomeGreeting, HomeHero, HomeSection } from "@repo/ui/home/HomeBits";
import { VENDOR_FEE_PERCENT, vendorCategory, type Vendor } from "@repo/lib/vendors/core";

import { VendorFrame } from "./frame";
import { requireVendor } from "./vendor";

export const metadata = { title: "Vendors" };

// The vendor's side: someone offering their services to photographers, not
// a business going through a studio's set-up. A vendor (joined at ./join)
// sees their home: what's waiting, the jobs that will come, their rates.
// Their profile is ./profile. Anyone else is sent to join.

export default async function VendorsPage() {
  const { session, vendor } = await requireVendor();
  return <MyVendorHome owner={session.name} avatarUrl={session.avatarUrl} vendor={vendor} />;
}

/** A vendor's home: what's waiting for them, empty until photographers book them. */
function MyVendorHome({ owner, avatarUrl, vendor }: { owner: string; avatarUrl: string | null; vendor: Vendor }) {
  const label = vendorCategory(vendor.category)?.label ?? "Vendor";
  const empty = (text: string) => <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{text}</p>;

  return (
    <VendorFrame vendor={vendor} page="home">
      <div className="space-y-8 px-4 py-6 sm:px-6 lg:py-8">
        <HomeGreeting name={owner} avatarUrl={avatarUrl} subtitle={`${vendor.name} · ${label}`} />
        <HomeHero title="You're on Aming" text="Add your rates and samples of your work, so photographers can book you." cta={{ label: "Add my rates", href: "#rates" }} />

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Earned this month", value: "UGX 0" },
            { label: `Aming's fee`, value: `${VENDOR_FEE_PERCENT}%`, note: "Of what clients pay" },
            { label: "Job requests", value: "0" },
            { label: "Jobs in hand", value: "0" },
          ].map((t) => (
            <div key={t.label} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
              <p className="text-xs text-muted">{t.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{t.value}</p>
              {t.note ? <p className="text-[11px] text-muted">{t.note}</p> : null}
            </div>
          ))}
        </section>

        <div id="jobs" className="scroll-mt-4">
          <HomeSection title="Job requests">{empty("No requests yet. Photographers on Aming will send them here.")}</HomeSection>
        </div>

        <div id="rates" className="scroll-mt-4">
          <HomeSection title="Your rates">{empty("No rates yet. Adding your prices comes next.")}</HomeSection>
        </div>
      </div>
    </VendorFrame>
  );
}
