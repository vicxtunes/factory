import Link from "next/link";

import { clientUrl } from "@repo/lib/client-portal/paths";
import { amingFeed } from "@repo/lib/studio-portal/feed";

import { ExploreFeed } from "./explore-feed";
import { APP_IDENTITY } from "./identity";

// Aming Space's front door for signed-out visitors while studios are on
// (page.tsx), like Behance's: the work of businesses that chose to show it
// on Aming first, to browse and open, then what the system does for a
// business. Each business's own public page carries only its own brand
// ([slug]/layout.tsx). Getting started is the usual phone sign-in, then
// My Business.

const START = "/?signin=1";

const FEATURES = [
  { title: "Bookings & packages", text: "Clients pick a package and a date on your page. You confirm, reschedule or decline in one tap." },
  { title: "Clients, each with their page", text: "Every client gets a private page with their bookings, quotations, invoices and photos. No password to remember." },
  { title: "Quotations & invoices", text: "Send a quotation, turn it into an invoice, record payments and see what's still owed." },
  { title: "Projects, tasks & team", text: "Plan every shoot as a project, share the tasks with your team and see what's due." },
  { title: "Photo delivery", text: "Upload a shoot and share galleries your clients can view and download in full quality." },
  { title: "Prints, albums & frames", text: "Sell products on your page and have them printed, bound and framed by Aming, under your name." },
];

const STEPS = [
  { title: "Sign in with your phone", text: "Then open My Business. It's ready in a minute." },
  { title: "Make it yours", text: "Add your logo, pick your color, list your services and packages." },
  { title: "Share your link", text: "Once approved, your page is live. Send it to clients on WhatsApp, Instagram, anywhere." },
];

export async function Landing() {
  const host = new URL(clientUrl("/"), "https://www.amingspace.com").host;
  // The front page still works when the feed can't load: it shows empty.
  const feed = await amingFeed().catch((error) => {
    console.error("landing: feed failed", error);
    return [];
  });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Aming <span className="text-brand-500">Space</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm sm:gap-4">
          <Link href="/vendors" className="hidden font-medium text-muted hover:text-foreground sm:inline">
            For vendors
          </Link>
          <Link href={START} className="font-medium hover:underline">
            Log in
          </Link>
          <Link href={START} className="inline-flex h-9 items-center rounded-full bg-brand-500 px-4 font-semibold text-white hover:bg-brand-600">
            Open your business
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-[1600px] px-4 pt-6 pb-4 sm:px-6 sm:pt-10">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Discover photographers and the people who work with them.</h1>
          <p className="mt-2 max-w-2xl text-muted">Albums and services from photographers and studios on Aming. Open one to see more and book.</p>
        </section>

        <ExploreFeed items={feed} />

        <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6">
          <p className="text-sm font-semibold tracking-widest text-brand-600 uppercase dark:text-brand-400">For photographers and vendors</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Run your business in one place, and show your work here.</h2>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Bookings, clients, quotations, invoices, projects and photo delivery. All under your own name, logo and colors, so your clients only ever see you.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={START} className="inline-flex min-h-12 items-center rounded-[var(--radius)] bg-brand-500 px-6 font-semibold text-white shadow-theme-xs hover:bg-brand-600">
              Open your business
            </Link>
            <Link href="/vendors" className="inline-flex min-h-12 items-center rounded-[var(--radius)] border border-border px-6 font-semibold hover:bg-surface">
              I&apos;m a photo editor, videographer or vendor
            </Link>
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything a photography business runs on</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl border border-border bg-background p-5">
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Your brand, not ours</h2>
            <p className="mt-3 text-muted">Your clients see your business, from the first link to the last download.</p>
          </div>
          <ul className="space-y-3">
            {[
              ["Your logo and color", "On your page, its buttons and links, and the browser tab."],
              ["Your own address", `${host}/your-business, to share anywhere.`],
              ["Your app on their phone", "Clients add your page to their home screen, with your name and icon."],
              ["No one else's name", "Nothing on your clients' side mentions us."],
            ].map(([title, text]) => (
              <li key={title} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
                <span>
                  <span className="font-semibold">{title}</span>
                  <span className="block text-sm text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Start in three steps</h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-border bg-background p-5">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">{i + 1}</span>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
            <Link href={START} className="mt-8 inline-flex min-h-12 items-center rounded-[var(--radius)] bg-brand-500 px-6 font-semibold text-white shadow-theme-xs hover:bg-brand-600">
              Open your business
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:px-6">
        <span>© {new Date().getFullYear()} {APP_IDENTITY.name}</span>
      </footer>
    </div>
  );
}
