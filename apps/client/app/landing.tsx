import Link from "next/link";

import { clientUrl } from "@repo/lib/client-portal/paths";
import { brandVars, studioInitials } from "@repo/lib/studios/core";

import { APP_IDENTITY } from "./identity";

// Aming Space's front door for signed-out visitors while studios are on
// (page.tsx): what the system does for a photography business. One page for
// everyone; each business's own public page carries only its own brand
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

// Sample businesses for the "your brand" picture: made-up names in their own colors.
const SAMPLES = [
  { name: "Lens & Light", color: "#1d4ed8", tagline: "Weddings · Portraits" },
  { name: "Bloom Studio", color: "#be185d", tagline: "Newborn · Family" },
  { name: "Savanna Frames", color: "#15803d", tagline: "Events · Corporate" },
];

export function Landing() {
  const host = new URL(clientUrl("/"), "https://www.amingspace.com").host;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Aming <span className="text-brand-500">Space</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href={START} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Log in
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-2 lg:pt-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">For photographers and studios</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Run your photography business in one place.</h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              Bookings, clients, quotations, invoices, projects and photo delivery. All under your own name, logo and colors, so your
              clients only ever see you.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={START} className="inline-flex min-h-12 items-center rounded-[var(--radius)] bg-brand-500 px-6 font-semibold text-white shadow-theme-xs hover:bg-brand-600">
                Open your business
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {SAMPLES.map((s) => (
              <SamplePage key={s.name} {...s} host={host} />
            ))}
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

/** A miniature of a business's public page, in its own color: what "your brand" looks like. */
function SamplePage({ name, color, tagline, host }: { name: string; color: string; tagline: string; host: string }) {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div style={brandVars(color)} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-md" aria-hidden>
      <p className="truncate border-b border-border px-3 py-1.5 font-mono text-[10px] text-muted">
        {host}/{slug}
      </p>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-500 text-[10px] font-bold text-white">{studioInitials(name)}</span>
        <span className="truncate text-xs font-semibold">{name}</span>
      </div>
      <div className="bg-gradient-to-r from-brand-900 via-brand-700 to-brand-500 px-3 py-5 text-center text-white">
        <p className="text-sm font-extrabold uppercase tracking-wide">{name}</p>
        <p className="text-[10px] text-white/80">{tagline}</p>
      </div>
      <div className="space-y-2 p-3">
        <div className="grid grid-cols-3 gap-1.5">
          {[100, 200, 300].map((shade) => (
            <span key={shade} className="aspect-square rounded-md" style={{ background: `var(--color-brand-${shade})` }} />
          ))}
        </div>
        <span className="block rounded-md bg-brand-500 py-1.5 text-center text-[11px] font-semibold text-white">Book now</span>
      </div>
    </div>
  );
}
