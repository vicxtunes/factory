import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { HomeGreeting, HomeHero, HomeSection } from "@repo/ui/home/HomeBits";
import {
  CalendarIcon,
  ClientsIcon,
  DashboardIcon,
  FilesIcon,
  InvoiceIcon,
  PaymentIcon,
  ProductsIcon,
  SettingsIcon,
  ShowroomIcon,
  TasksIcon,
} from "@repo/ui/icons";
import { getClientSession } from "@repo/lib/auth/session";
import { studioInitials } from "@repo/lib/studios/core";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";
import { SOCIAL_NETWORKS, VENDOR_FEE_PERCENT, vendorCategory, type Vendor } from "@repo/lib/vendors/core";
import { vendors } from "@repo/lib/vendors/server";

import { LogOut } from "./log-out";

export const metadata = { title: "Vendors" };

// The vendor's side: someone offering their services to photographers, not
// a business going through a studio's set-up. A vendor (joined at ./join)
// sees their own home: who they are, what they offer, and the jobs that will
// come. Anyone else is sent to join. The jobs, calendar and money aren't
// wired yet, so the menu's entries don't go anywhere.

const NAV = [
  { label: "Dashboard", Icon: DashboardIcon, on: true },
  { label: "Jobs", Icon: TasksIcon },
  { label: "Calendar", Icon: CalendarIcon },
  { label: "Drive", Icon: FilesIcon },
  { label: "Clients", Icon: ClientsIcon },
  { label: "Quotations", Icon: InvoiceIcon },
  { label: "Invoices", Icon: InvoiceIcon },
  { label: "Wallet", Icon: PaymentIcon },
  { label: "Rates & packages", Icon: ProductsIcon },
  { label: "Showroom", Icon: ShowroomIcon },
  { label: "Settings", Icon: SettingsIcon },
];

export default async function VendorsPage() {
  if (!STUDIOS_ENABLED) notFound();
  const session = await getClientSession();
  const vendor = session ? await vendors.mine(session.client_id) : null;
  if (!session || !vendor) redirect("/vendors/join");
  return <MyVendorHome owner={session.name} vendor={vendor} />;
}

/** The vendor's menu (wider screens). The pages behind it come next, so its entries don't go anywhere yet. */
function Sidebar({ name, label, footer }: { name: string; label: string; footer?: ReactNode }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-sm font-semibold text-white">{studioInitials(name)}</span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block text-xs text-muted">{label}</span>
        </span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(({ label: l, Icon, on }) => (
          <span
            key={l}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${on ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-muted"}`}
          >
            <Icon className="size-5" />
            {l}
          </span>
        ))}
      </nav>
      {footer ? <div className="border-t border-border p-3">{footer}</div> : null}
    </aside>
  );
}

/** A signed-in vendor's own home: their profile as they gave it at sign-up, and their work, empty until photographers book them. */
function MyVendorHome({ owner, vendor }: { owner: string; vendor: Vendor }) {
  const label = vendorCategory(vendor.category)?.label ?? "Vendor";
  const socials = SOCIAL_NETWORKS.flatMap((n) => {
    const handle = vendor.socials[n.id];
    return handle ? [{ ...n, handle, href: `https://${n.prefix}${handle}` }] : [];
  });
  const empty = (text: string) => <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{text}</p>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <Sidebar name={vendor.name} label={label} footer={<LogOut />} />
        <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6 lg:py-8">
          <div className="flex items-start justify-between gap-3">
            <HomeGreeting name={owner} avatarUrl={null} subtitle={`${vendor.name} · ${label}`} />
            <div className="lg:hidden">
              <LogOut />
            </div>
          </div>
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

          <HomeSection title="Job requests">{empty("No requests yet. Photographers on Aming will send them here.")}</HomeSection>

          <section className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Your profile</h3>
              <span className="text-xs text-muted">{vendor.kind === "business" ? "Business" : "Individual"}</span>
            </div>
            {vendor.skills.length ? (
              <div className="flex flex-wrap gap-2">
                {vendor.skills.map((skill) => (
                  <span key={skill} className="rounded-full border border-border bg-background px-3 py-1 text-sm">
                    {skill}
                  </span>
                ))}
              </div>
            ) : null}
            {socials.length ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {socials.map((n) => (
                  <li key={n.id}>
                    <a href={n.href} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline dark:text-brand-400">
                      {n.label}: {n.id === "website" ? n.handle : `@${n.handle}`}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <div id="rates" className="scroll-mt-4">
            <HomeSection title="Your rates">{empty("No rates yet. Adding your prices comes next.")}</HomeSection>
          </div>
        </main>
      </div>
    </div>
  );
}
