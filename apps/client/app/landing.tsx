import Link from "next/link";
import type { ComponentType } from "react";

import { CalendarIcon, ClientsIcon, DisplayIcon, InvoiceIcon, TasksIcon, WorkersIcon } from "@repo/ui/icons";
import { isOptionCategory } from "@repo/lib/catalog-options";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { fetchProductCatalog } from "@repo/lib/queries";
import type { FeedItem } from "@repo/lib/studio-portal/core";
import { amingFeed } from "@repo/lib/studio-portal/feed";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_INTL } from "@repo/lib/support/constants";

import { ExploreFeed } from "./explore-feed";
import { APP_IDENTITY } from "./identity";
import { LandingSignup } from "./landing-signup";
import { LandingWalkthrough } from "./landing-walkthrough";

// Aming Space's front door for signed-out visitors (page.tsx), built on
// GitHub's front page, section for section:
//   announcement pill (the running deal)  → GitHub's event pill
//   headline + email box                   → "Sign up for GitHub"
//   activity strip with the numbers        → GitHub's live activity + 225M+
//   two platform cards                     → GitHub / Copilot
//   "More ways to use Aming Space"         → "More ways to use GitHub"
//   studio logos + featured studios        → companies + customer stories
//   the studios' work                      → featured repositories
//   closing headline + email box, footer   → "Join the world's largest…"
// Everything is real: the work and studios come from the feed, the prints
// and the deal from the catalog. Each section shares one width (WRAP).
// Light or dark with the device, like the rest of the app (theme tokens).

const LOG_IN = "/?signin=1";
const START = "/?signin=new";
const WRAP = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

const MORE: { title: string; text: string; icon: ComponentType<{ className?: string }> }[] = [
  { title: "Bookings & packages", text: "Clients pick a package and a date on your page.", icon: CalendarIcon },
  { title: "A page for every client", text: "Bookings, quotations, invoices and photos in one private page.", icon: ClientsIcon },
  { title: "Quotations & invoices", text: "Quote, invoice, record payments, see what's owed.", icon: InvoiceIcon },
  { title: "Projects & team", text: "Every shoot a project, its tasks shared with your team.", icon: TasksIcon },
  { title: "Photo delivery", text: "Galleries clients view and download in full quality.", icon: DisplayIcon },
  { title: "Editors & vendors", text: "Hire photo editors, videographers and vendors for a job.", icon: WorkersIcon },
];

/** What Drive does (packages/lib/files/README.md), for its section. */
const DRIVE: [string, string][] = [
  ["Files up to 1 GB, kept as uploaded", "Any type: RAW, video, zips, PDFs. Nothing is shrunk or split, and big uploads carry on in the background."],
  ["A folder for every project, by itself", "Each booking you turn into a project gets its folder. Make your own folders, as deep as you like."],
  ["Share like Google Drive", "With a client on their page, with your team, or with anyone who has the link. Viewer, contributor or editor, and downloads on or off."],
  ["Proofs that protect your work", "Photos still in production show watermarked, with saving and printing blocked. Clients never get the original until you say."],
  ["Fast to open, easy to hand over", "Folders open on light previews with location details removed. Download chosen files or a whole folder as a zip."],
];

type Studio = { id: string; name: string; slug: string; logoUrl: string | null; brandColor: string | null; cover: string; albums: number; photos: number };

/** Each studio in the feed once, with its first cover and how much it shows; the most photos first. */
function studiosOf(feed: FeedItem[]): Studio[] {
  const byId = new Map<string, Studio>();
  for (const item of feed) {
    const s = byId.get(item.business.id) ?? { ...item.business, cover: item.coverUrl, albums: 0, photos: 0 };
    if (item.kind === "album") {
      s.albums += 1;
      s.photos += item.photoCount;
    }
    byId.set(s.id, s);
  }
  return [...byId.values()].sort((a, b) => b.photos - a.photos);
}

export async function Landing() {
  const host = new URL(clientUrl("/"), "https://www.amingspace.com").host;
  // The front page still works when either can't load: the sections that need it hide.
  const [feed, catalog] = await Promise.all([
    amingFeed().catch((error) => {
      console.error("landing: feed failed", error);
      return [];
    }),
    fetchProductCatalog(true).catch((error) => {
      console.error("landing: catalog failed", error);
      return [];
    }),
  ]);
  const studios = studiosOf(feed);
  const photos = studios.reduce((sum, s) => sum + s.photos, 0);
  const albums = studios.reduce((sum, s) => sum + s.albums, 0);
  const prints = catalog
    .filter((c) => c.in_showroom && !isOptionCategory(c))
    .flatMap((c) => c.products)
    .filter((p) => p.display_image_url);
  const deal = prints.find((p) => p.offer)?.offer?.name;

  // The activity strip: what studios shared, with the numbers between, in two rows.
  const activity = feed.slice(0, 24).map((item) => ({
    key: item.id,
    who: item.business.name,
    what: item.kind === "album" ? "shared" : "offers",
    title: item.title,
  }));
  const numbers = [
    { value: studios.length, label: "studios showing their work" },
    { value: albums, label: "albums shared" },
    { value: photos, label: "photos in them" },
  ].filter((n) => n.value > 0);
  const rows = [activity.filter((_, i) => i % 2 === 0), activity.filter((_, i) => i % 2 === 1)];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className={`${WRAP} flex h-16 items-center justify-between gap-4`}>
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold tracking-tight">
              Aming <span className="text-brand-500">Space</span>
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-1 text-sm lg:flex">
              {[
                ["Platform", "#platform"],
                ["Drive", "#drive"],
                ["Studios", "#studios"],
                ["Work", "#work"],
              ].map(([label, href]) => (
                <a key={href} href={href} className="rounded-md px-3 py-2 font-medium text-muted hover:text-foreground">
                  {label}
                </a>
              ))}
              <Link href="/vendors" className="rounded-md px-3 py-2 font-medium text-muted hover:text-foreground">
                For vendors
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link href={LOG_IN} className="rounded-md px-3 py-2 font-medium hover:bg-surface">
              Log in
            </Link>
            <Link href={START} className="rounded-md border border-border px-3 py-2 font-medium hover:border-foreground">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* The top: the deal, the headline, the email box. A soft brand glow behind, like GitHub's. */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[36rem] max-w-5xl rounded-full opacity-20 blur-3xl dark:opacity-40"
            style={{ background: "radial-gradient(closest-side, var(--color-brand-500), transparent)" }}
          />
          <div className={`${WRAP} relative flex flex-col items-center py-20 text-center sm:py-28 lg:py-36`}>
            {deal ? (
              <a href="#prints" className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-3 pl-1 text-sm hover:border-muted">
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">On now</span>
                <span className="font-medium">{deal} on prints and photo books</span>
                <span aria-hidden>→</span>
              </a>
            ) : null}
            <h1 className="max-w-4xl text-5xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
              Your photography business,
              <span className="block bg-gradient-to-r from-brand-300 via-brand-500 to-brand-600 bg-clip-text text-transparent">in one place.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted sm:text-xl">
              Bookings, clients, invoices and photo delivery under your own name, logo and colors. Your clients only ever see you.
            </p>
            <div className="mt-10 flex w-full justify-center">
              <LandingSignup id="signup-top" />
            </div>
            <a href="#work" className="mt-5 text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline">
              See the studios&apos; work →
            </a>
          </div>
        </section>

        {/* The product walkthrough: GitHub's tabs over a big screenshot of the product. */}
        <section aria-label="Aming Space, part by part" className={`${WRAP} pb-20 sm:pb-28`}>
          <LandingWalkthrough />
        </section>

        {/* What's happening on Aming, moving, with the numbers in between: GitHub's activity strip. */}
        {activity.length ? (
          <section aria-label="Activity on Aming" className="space-y-3 overflow-hidden border-y border-border py-6">
            {rows.map((row, r) => {
              const cells = row.map((a) => (
                  <span key={a.key} className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm whitespace-nowrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden />
                    <span className="text-muted">{a.who}</span>
                    <span className="text-muted/70">{a.what}</span>
                    <span className="font-medium">{a.title}</span>
                  </span>
              ));
              // A number after every third item, the row's own share of them.
              numbers.forEach((n, i) => {
                const at = Math.min(cells.length, (i + 1) * 3 + i);
                cells.splice(
                  at,
                  0,
                  <span key={`n${r}${i}`} className="flex shrink-0 items-baseline gap-2 px-4 whitespace-nowrap">
                    <span className="text-2xl font-extrabold text-brand-600 dark:text-brand-400 tabular-nums">{n.value.toLocaleString("en-UG")}</span>
                    <span className="text-sm text-muted">{n.label}</span>
                  </span>,
                );
              });
              return (
                <div key={r} className="landing-marquee-row flex">
                  <div className={`landing-marquee flex w-max ${r === 1 ? "landing-marquee-reverse" : ""}`}>
                    <div className="flex gap-3 pr-3">{cells}</div>
                    {/* The same again, hidden from screen readers, so the loop has no jump. */}
                    <div aria-hidden className="flex gap-3 pr-3">
                      {cells}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ) : null}

        {/* Two platform cards: GitHub's "GitHub" and "Copilot". */}
        <section id="platform" className={`${WRAP} scroll-mt-16 py-20 sm:py-28`}>
          <p className="text-sm font-semibold tracking-widest text-brand-600 dark:text-brand-400 uppercase">Aming platform</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">Run the business, then print the work.</h2>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <article className="flex flex-col overflow-hidden rounded-3xl border border-border bg-surface">
              <div className="p-8 sm:p-10">
                <h3 className="text-2xl font-bold">Aming Space</h3>
                <p className="mt-2 text-lg text-muted">Bookings, clients, quotations, invoices, projects and photo delivery, all under your brand.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={START} className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-brand-500 px-5 font-semibold text-white hover:bg-brand-600">
                    Open your business
                  </Link>
                  <a href="#more" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-border px-5 font-semibold hover:border-muted">
                    Learn more
                  </a>
                </div>
              </div>
              {studios.length >= 3 ? (
                <div className="mt-auto grid grid-cols-3 gap-2 px-8 pb-8 sm:px-10 sm:pb-10">
                  {studios.slice(0, 3).map((s) => (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage link, already resized
                    <img key={s.id} src={s.cover} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
                  ))}
                </div>
              ) : null}
            </article>
            <article id="prints" className="flex scroll-mt-16 flex-col overflow-hidden rounded-3xl border border-border bg-surface">
              <div className="p-8 sm:p-10">
                <h3 className="text-2xl font-bold">Prints by Aming</h3>
                <p className="mt-2 text-lg text-muted">Photo books, frames and boards, printed and bound by Aming and sold on your page under your name.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={LOG_IN} className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-brand-500 px-5 font-semibold text-white hover:bg-brand-600">
                    Order prints
                  </Link>
                  {deal ? <span className="inline-flex min-h-11 items-center rounded-[var(--radius)] px-1 text-sm font-semibold text-brand-600 dark:text-brand-400">{deal} is on</span> : null}
                </div>
              </div>
              {prints.length >= 3 ? (
                <div className="mt-auto grid grid-cols-3 gap-2 px-8 pb-8 sm:px-10 sm:pb-10">
                  {prints.slice(0, 3).map((p) => (
                    <Link key={p.id} href={`/${encodeURIComponent(p.slug)}`} prefetch={false} className="group block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- product photo */}
                      <img src={p.display_image_url!} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-xl bg-background object-contain p-1.5 transition-opacity group-hover:opacity-80" />
                      <span className="mt-2 block truncate text-xs font-medium text-muted">{p.name}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          </div>
        </section>

        {/* Drive, on its own: what it does for a studio's files, beside a real studio's Drive. */}
        <section id="drive" className="scroll-mt-16 border-y border-border bg-surface">
          <div className={`${WRAP} grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-[5fr_7fr]`}>
            <div>
              <p className="text-sm font-semibold tracking-widest text-brand-600 uppercase dark:text-brand-400">Drive</p>
              <h2 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Every file in one place, shared the right way.</h2>
              <p className="mt-4 text-lg text-muted">Raw shoots, edits, contracts and videos, kept in folders next to your bookings and clients. No more sending files around WhatsApp or chasing flash drives.</p>
              <ul className="mt-8 space-y-5">
                {DRIVE.map(([title, text]) => (
                  <li key={title} className="flex gap-3">
                    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-brand-500">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.58l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                    </svg>
                    <span>
                      <span className="font-semibold">{title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-theme-xl">
              <div aria-hidden className="flex items-center gap-1.5 border-b border-border px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-error-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-success-500/70" />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- static screenshot */}
              <img src="/landing/drive.jpg" alt="A studio's Drive on Aming Space: a folder of photos with Share, New folder and Upload" loading="lazy" className="block w-full" />
            </div>
          </div>
        </section>

        {/* "More ways to use GitHub". */}
        <section id="more" className={`${WRAP} scroll-mt-16 pb-20 sm:pb-28`}>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">More ways to use Aming Space</h2>
          <div className="mt-8 grid gap-px overflow-hidden rounded-3xl border border-border bg-border grid-cols-2 lg:grid-cols-3">
            {MORE.map(({ title, text, icon: Icon }) => (
              <Link key={title} href={title === "Editors & vendors" ? "/vendors" : START} className="group flex flex-col bg-background p-4 transition-colors hover:bg-surface sm:p-6">
                <Icon className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
                <span className="mt-4 text-sm font-semibold text-brand-600 dark:text-brand-400 group-hover:underline">Explore →</span>
              </Link>
            ))}
          </div>
        </section>

        {/* The middle call: "Whatever you're building, you can build it on GitHub". */}
        <section className="border-y border-border bg-surface">
          <div className={`${WRAP} flex flex-col items-start gap-6 py-14 lg:flex-row lg:items-center lg:justify-between`}>
            <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">Weddings, portraits or events, you can run it on Aming Space.</h2>
            <Link href={START} className="inline-flex min-h-12 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-6 font-semibold text-white hover:bg-brand-600">
              Open your business
            </Link>
          </div>
        </section>

        {/* Studios on Aming: GitHub's company logos, then its customer stories. */}
        {studios.length ? (
          <section id="studios" className={`${WRAP} scroll-mt-16 py-20 sm:py-28`}>
            <p className="text-center text-xs font-semibold tracking-widest text-muted uppercase">Studios on Aming</p>
            {/* GitHub's company logos: the logo alone, all the same height, dark ink in light mode, white in dark.
                Logos are stored dark on a white square (the uploader saves JPEG on white), so in light
                mode they're multiplied (the white square vanishes); in dark mode turned negative and
                screened (the square vanishes, the ink turns white). No logo: the name, as a wordmark. */}
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-14 gap-y-8">
              {studios.map((s) => (
                <li key={s.id}>
                  <Link href={`/${s.slug}`} prefetch={false} title={s.name} className="group block">
                    {s.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed storage link
                      <img src={s.logoUrl} alt={s.name} className="h-12 w-auto max-w-44 object-contain opacity-75 mix-blend-multiply transition-opacity [filter:grayscale(1)_contrast(1.4)] group-hover:opacity-100 sm:h-14 dark:mix-blend-screen dark:[filter:grayscale(1)_invert(1)_contrast(1.4)]" />
                    ) : (
                      <span className="text-xl font-extrabold tracking-tight opacity-75 transition-opacity group-hover:opacity-100">{s.name}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-16 flex items-end justify-between gap-4">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Featured studios</h2>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {studios.slice(0, 3).map((s) => (
                <Link key={s.id} href={`/${s.slug}`} prefetch={false} className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-surface transition-colors hover:border-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed storage link, already resized */}
                  <img src={s.cover} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="text-lg font-bold">{s.name}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {s.albums} album{s.albums === 1 ? "" : "s"} · {s.photos.toLocaleString("en-UG")} photos on Aming
                    </p>
                    <span className="mt-6 text-sm font-semibold text-brand-600 dark:text-brand-400 group-hover:underline">Visit their page →</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* The work: GitHub's featured repositories. */}
        <section id="work" className="scroll-mt-16 border-t border-border py-20 sm:py-28">
          <div className={WRAP}>
            <p className="text-sm font-semibold tracking-widest text-brand-600 dark:text-brand-400 uppercase">Built on Aming</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Work from studios on Aming</h2>
            <p className="mt-3 max-w-2xl text-lg text-muted">Albums and services from photographers who show their work here. Open one to see more and book.</p>
          </div>
          <ExploreFeed items={feed} wrap={WRAP} />
        </section>

        {/* The closing call with the email box again, under the same glow. */}
        <section className="relative overflow-hidden border-t border-border">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -bottom-40 mx-auto h-[28rem] max-w-4xl rounded-full opacity-15 blur-3xl dark:opacity-30"
            style={{ background: "radial-gradient(closest-side, var(--color-brand-500), transparent)" }}
          />
          <div className={`${WRAP} relative flex flex-col items-center py-24 text-center sm:py-32`}>
            <h2 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">Join the studios on Aming Space</h2>
            <p className="mt-4 max-w-xl text-lg text-muted">Create your account, add your logo and colors, and share your page with clients.</p>
            <div className="mt-10 flex w-full justify-center">
              <LandingSignup id="signup-bottom" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className={`${WRAP} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-5`}>
          <div className="lg:col-span-2">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Aming <span className="text-brand-500">Space</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm text-muted">{APP_IDENTITY.description}</p>
            <p className="mt-3 text-sm text-muted">Your page lives at {host}/your-business.</p>
          </div>
          {[
            {
              title: "Platform",
              links: [
                ["Open your business", START],
                ["Order prints", LOG_IN],
                ["Log in", LOG_IN],
              ],
            },
            {
              title: "Explore",
              links: [
                ["Studios", "#studios"],
                ["Work", "#work"],
                ["For vendors", "/vendors"],
              ],
            },
            {
              title: "Help",
              links: [
                ["WhatsApp us", `https://wa.me/${SUPPORT_PHONE_INTL}`],
                [`Call ${SUPPORT_PHONE_DISPLAY}`, `tel:+${SUPPORT_PHONE_INTL}`],
              ],
            },
          ].map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-sm font-semibold">{col.title}</p>
              <ul className="mt-4 space-y-3 text-sm text-muted">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="hover:text-foreground">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className={`${WRAP} border-t border-border py-6 text-sm text-muted`}>
          © {new Date().getFullYear()} {APP_IDENTITY.name}
        </div>
      </footer>
    </div>
  );
}
