import { HomeGreeting, HomeHero, HomeSection } from "@repo/ui/home/HomeBits";
import { VENDOR_FEE_PERCENT, vendorCategory, type JobView, type Vendor } from "@repo/lib/vendors/core";

import { vendorJobs, vendors } from "@repo/lib/vendors/server";

import { VendorFrame } from "./frame";
import { JobList } from "./job-list";
import { requireVendor } from "./vendor";

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

export const metadata = { title: "Vendors" };

// The vendor's side: someone offering their services to photographers, not
// a business going through a studio's set-up. A vendor (joined at ./join)
// sees their home: what's in their wallet, studios' job requests to
// answer, and the jobs in hand (each its own page, ./jobs/[id]). Their Drive
// is ./drive, their profile ./profile. Anyone else is sent to join.

export default async function VendorsPage() {
  const { session, vendor } = await requireVendor();
  const [photoUrl, jobs, balance] = await Promise.all([vendors.pictureUrl(vendor.photoKey), vendorJobs.forVendor(session.client_id), vendors.walletBalance(vendor)]);
  return <MyVendorHome owner={session.name} avatarUrl={photoUrl ?? session.avatarUrl} vendor={vendor} jobs={jobs} balance={balance} />;
}

/** A vendor's home: what's waiting for them, empty until photographers book them. */
function MyVendorHome({ owner, avatarUrl, vendor, jobs, balance }: { owner: string; avatarUrl: string | null; vendor: Vendor; jobs: JobView[]; balance: number }) {
  const requests = jobs.filter((j) => j.status === "requested");
  const inHand = jobs.filter((j) => j.status === "accepted" || j.status === "delivered");
  const label = vendorCategory(vendor.category)?.label ?? "Vendor";
  const empty = (text: string) => <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{text}</p>;

  return (
    <VendorFrame vendor={vendor} page="home">
      <div className="space-y-8 px-4 py-6 sm:px-6 lg:py-8">
        <HomeGreeting name={owner} avatarUrl={avatarUrl} subtitle={`${vendor.name} · ${label}`} />
        {requests.length ? (
          <HomeHero
            title={`${requests.length} job request${requests.length === 1 ? "" : "s"} waiting`}
            text="Studios want you on their projects: accept to see the brief's files and start."
            cta={{ label: "See requests", href: "/vendors/jobs" }}
          />
        ) : (
          <HomeHero title="You're on Aming" text="Studios find you by name and what you do. Keep your profile and work up to date." cta={{ label: "My profile", href: "/vendors/profile" }} />
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Wallet", value: money(balance), note: "What studios paid you" },
            { label: `Aming's fee`, value: `${VENDOR_FEE_PERCENT}%`, note: "Of each job's price" },
            { label: "Job requests", value: String(requests.length) },
            { label: "Jobs in hand", value: String(inHand.length) },
          ].map((t) => (
            <div key={t.label} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
              <p className="text-xs text-muted">{t.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{t.value}</p>
              {t.note ? <p className="text-[11px] text-muted">{t.note}</p> : null}
            </div>
          ))}
        </section>

        <div id="jobs" className="scroll-mt-4 space-y-8">
          <HomeSection title="Job requests" href="/vendors/jobs">
            {requests.length ? <JobList jobs={requests} answer /> : empty("No requests yet. Studios on Aming will send them here.")}
          </HomeSection>
          <HomeSection title="Jobs in hand" href="/vendors/jobs">
            {inHand.length ? <JobList jobs={inHand} /> : empty("Nothing in hand.")}
          </HomeSection>
        </div>
      </div>
    </VendorFrame>
  );
}
