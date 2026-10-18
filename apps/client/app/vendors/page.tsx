import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CardRail, HomeGreeting, HomeHero, HomeSection, QuickActions, type QuickAction, type RailCard } from "@repo/ui/home/HomeBits";
import { PackageList } from "@repo/ui/home/PackageList";
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
// a business going through a studio's set-up. A signed-in vendor (joined at
// ./join) sees their own home: who they are, what they offer, and the jobs
// that will come. Anyone else sees the same workspace with sample data, as a
// photo editor or a videographer (?as=), and a way to join. The jobs,
// calendar and money aren't wired yet; their links stay on this page.

type Previewed = "photo_editor" | "videographer";

interface Job {
  id: string;
  from: string;
  what: string;
  detail: string;
  due: string;
  price: string;
}

interface Sample {
  owner: string;
  business: string;
  hero: { title: string; text: string; cta: string };
  actions: QuickAction[];
  stats: { label: string; value: string; note?: string }[];
  requestsTitle: string;
  requests: Job[];
  inHandTitle: string;
  inHand: (RailCard & { progress: number })[];
  rates: RailCard[];
}

const UGX = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

const fee = (earned: number) => ({ label: `Aming's fee (${VENDOR_FEE_PERCENT}%)`, value: UGX((earned * VENDOR_FEE_PERCENT) / 100), note: "Taken as clients pay" });

const SAMPLES: Record<Previewed, Sample> = {
  photo_editor: {
    owner: "Kato Brian",
    business: "Kato Edits",
    hero: { title: "3 photographers are waiting", text: "Accept their editing jobs: accepting sends them your quotation.", cta: "Review jobs" },
    actions: [
      { label: "New job", icon: "calendar", href: "#jobs" },
      { label: "New invoice", icon: "invoice", href: "#" },
      { label: "Add client", icon: "client", href: "#" },
      { label: "Deliver edits", icon: "store", href: "#editing" },
    ],
    stats: [
      { label: "Earned this month", value: UGX(2_450_000) },
      fee(2_450_000),
      { label: "Photos edited", value: "1,284", note: "This month" },
      { label: "Jobs in hand", value: "6" },
    ],
    requestsTitle: "Job requests",
    requests: [
      { id: "j1", from: "Lens & Light Studio", what: "Wedding · Nakato & Ssali", detail: "450 photos · Colour + skin retouch", due: "Due Fri 24 Oct", price: UGX(900_000) },
      { id: "j2", from: "Bloom Studio", what: "Newborn session", detail: "60 photos · Full retouch", due: "Due Mon 27 Oct", price: UGX(300_000) },
      { id: "j3", from: "Savanna Frames", what: "Corporate gala", detail: "220 photos · Colour", due: "Due Wed 29 Oct", price: UGX(440_000) },
    ],
    inHandTitle: "In editing",
    inHand: [
      { id: "e1", href: "#editing", title: "Kintu introduction", tag: "Colour + retouch", meta: "Lens & Light · due Tue 21 Oct", metaIcon: "calendar", price: UGX(600_000), imageUrl: null, person: "Lens & Light", progress: 72 },
      { id: "e2", href: "#editing", title: "Graduation portraits", tag: "Full retouch", meta: "Bloom Studio · due Thu 23 Oct", metaIcon: "calendar", price: UGX(250_000), imageUrl: null, person: "Bloom Studio", progress: 35 },
      { id: "e3", href: "#editing", title: "Album design · Okello", tag: "Album", meta: "Savanna Frames · due Sat 25 Oct", metaIcon: "calendar", price: UGX(150_000), imageUrl: null, person: "Savanna Frames", progress: 10 },
    ],
    rates: [
      { id: "r1", href: "#", title: "Colour correction", tag: "Per photo", meta: "Exposure, white balance, a consistent look", price: UGX(2_000), imageUrl: null },
      { id: "r2", href: "#", title: "Skin retouch", tag: "Per photo", meta: "Colour, skin, blemishes, stray hairs", price: UGX(5_000), imageUrl: null },
      { id: "r3", href: "#", title: "Album design", tag: "Per album", meta: "Up to 40 spreads · two rounds of changes", price: UGX(150_000), imageUrl: null },
    ],
  },
  videographer: {
    owner: "Nambi Grace",
    business: "Nambi Films",
    hero: { title: "2 clients want a date", text: "Confirm their shoot dates: confirming sends them your invoice.", cta: "Review requests" },
    actions: [
      { label: "New booking", icon: "calendar", href: "#jobs" },
      { label: "New invoice", icon: "invoice", href: "#" },
      { label: "Add client", icon: "client", href: "#" },
      { label: "Deliver a film", icon: "store", href: "#editing" },
    ],
    stats: [
      { label: "Earned this month", value: UGX(5_800_000) },
      fee(5_800_000),
      { label: "Shoots this month", value: "7" },
      { label: "Films in the edit", value: "4" },
    ],
    requestsTitle: "Booking requests",
    requests: [
      { id: "b1", from: "Achieng & Tumusiime", what: "Wedding · full day", detail: "Ceremony + reception · Munyonyo", due: "Sat 8 Nov", price: UGX(3_500_000) },
      { id: "b2", from: "Lens & Light Studio", what: "Second shooter", detail: "Introduction · 6 hours · Mukono", due: "Sat 1 Nov", price: UGX(800_000) },
    ],
    inHandTitle: "In the edit",
    inHand: [
      { id: "f1", href: "#editing", title: "Nakato & Ssali highlight", tag: "Highlight film", meta: "Delivery due Fri 24 Oct", metaIcon: "calendar", price: UGX(2_000_000), imageUrl: null, person: "Nakato Sarah", progress: 80 },
      { id: "f2", href: "#editing", title: "Café Javas launch", tag: "Event film", meta: "Delivery due Mon 27 Oct", metaIcon: "calendar", price: UGX(1_200_000), imageUrl: null, person: "Café Javas", progress: 45 },
      { id: "f3", href: "#editing", title: "Okello kwanjula", tag: "Full ceremony", meta: "Delivery due Fri 31 Oct", metaIcon: "calendar", price: UGX(2_500_000), imageUrl: null, person: "Okello Peter", progress: 15 },
    ],
    rates: [
      { id: "v1", href: "#", title: "Highlight film", tag: "Weddings", meta: "3–5 minutes · one shooter · music licensed", price: UGX(2_000_000), imageUrl: null },
      { id: "v2", href: "#", title: "Full ceremony", tag: "Weddings", meta: "Full day · two shooters · drone", price: UGX(3_500_000), imageUrl: null },
      { id: "v3", href: "#", title: "Event coverage", tag: "Events", meta: "Up to 6 hours · 2-minute recap", price: UGX(1_200_000), imageUrl: null },
    ],
  },
};

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

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  if (!STUDIOS_ENABLED) notFound();
  const session = await getClientSession();
  const vendor = session ? await vendors.mine(session.client_id) : null;
  if (session && vendor) return <MyVendorHome owner={session.name} vendor={vendor} />;

  const as: Previewed = (await searchParams).as === "videographer" ? "videographer" : "photo_editor";
  const s = SAMPLES[as];
  const label = vendorCategory(as)?.label ?? "Vendor";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-b border-border bg-brand-50 px-4 py-2 text-sm dark:bg-brand-500/10">
        <span className="font-medium">Vendor workspace preview · sample data</span>
        <span className="flex gap-1.5">
          {(["photo_editor", "videographer"] as const).map((v) => (
            <Link
              key={v}
              href={`/vendors?as=${v}`}
              aria-current={v === as ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${v === as ? "bg-foreground text-background" : "border border-border bg-surface"}`}
            >
              {vendorCategory(v)?.label}
            </Link>
          ))}
        </span>
        <Link href="/vendors/join" className="rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600">
          Join as a vendor
        </Link>
      </div>

      <div className="flex">
        <Sidebar name={s.business} label={label} />

        <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6 lg:py-8">
          <HomeGreeting name={s.owner} avatarUrl={null} subtitle={`${s.business} · ${label}`} />
          <HomeHero title={s.hero.title} text={s.hero.text} cta={{ label: s.hero.cta, href: "#jobs" }} />
          <QuickActions actions={s.actions} />

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {s.stats.map((t) => (
              <div key={t.label} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
                <p className="text-xs text-muted">{t.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{t.value}</p>
                {t.note ? <p className="text-[11px] text-muted">{t.note}</p> : null}
              </div>
            ))}
          </section>

          <div id="jobs" className="scroll-mt-4">
            <HomeSection title={s.requestsTitle}>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {s.requests.map((j) => (
                  <li key={j.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-brand-600 dark:text-brand-400">{j.from}</p>
                      <p className="truncate font-semibold">{j.what}</p>
                      <p className="text-sm text-muted">
                        {j.detail} · {j.due}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                      <span className="flex-1 font-semibold tabular-nums sm:flex-none">{j.price}</span>
                      <span className="flex gap-2">
                        <span className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium">Decline</span>
                        <span className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white">Accept</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </HomeSection>
          </div>

          <div id="editing" className="scroll-mt-4">
            <HomeSection title={s.inHandTitle}>
              <CardRail cards={s.inHand} />
              <ul className="space-y-2">
                {s.inHand.map((e) => (
                  <li key={e.id} className="text-sm">
                    <span className="flex justify-between gap-3">
                      <span className="truncate">{e.title}</span>
                      <span className="shrink-0 text-muted tabular-nums">{e.progress}%</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${e.progress}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </HomeSection>
          </div>

          <HomeSection title="Your rates">
            <PackageList packages={s.rates} allLabel="All rates" />
          </HomeSection>
        </main>
      </div>
    </div>
  );
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
