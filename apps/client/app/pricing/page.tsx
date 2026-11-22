import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PAGE_TEMPLATES } from "@repo/lib/pro/core";
import { proPage, proPrice } from "@repo/lib/pro/server";
import { SUPPORT_PHONE_INTL } from "@repo/lib/support/constants";

export const metadata: Metadata = { title: "Pricing", description: "Aming is free to run your business. Pro gives your page a look that stands out." };

const WRAP = "mx-auto w-full max-w-5xl px-4 sm:px-6";
const START = "/?signin=new";
const ugx = (n: number) => `UGX ${n.toLocaleString("en-UG")}`;

/**
 * Free vs Pro, for anyone (owner, 2026-11-22). The words and the list are the
 * boss's (staff dashboard → Studios → Pro), the price too; read on each visit
 * so a change there shows at once.
 */
export default async function PricingPage() {
  await connection();
  const [page, price] = await Promise.all([proPage(), proPrice()]);
  const free = page.features.filter((f) => f.free);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className={`${WRAP} flex h-16 items-center justify-between gap-4`}>
          <Link href="/" className="text-xl font-bold tracking-tight">
            Aming <span className="text-brand-500">Space</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/?signin=1" className="rounded-md px-3 py-2 font-medium hover:bg-surface">
              Log in
            </Link>
            <Link href={START} className="rounded-md border border-border px-3 py-2 font-medium hover:border-foreground">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className={`${WRAP} py-12 sm:py-16`}>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Pricing</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-5xl">{page.headline}</h1>
          {page.blurb ? <p className="mt-4 text-lg text-muted text-pretty">{page.blurb}</p> : null}
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <Plan
            name="Free"
            price="UGX 0"
            per="forever"
            note="Everything to run your business."
            lines={free.map((f) => f.text)}
            cta={{ label: "Open your business", href: START }}
          />
          <Plan
            name="Pro"
            highlight
            price={price ? ugx(price) : "Coming soon"}
            per={price ? "a month" : null}
            note="Everything in Free, and:"
            lines={page.features.filter((f) => !f.free).map((f) => f.text)}
            cta={{ label: price ? "Get Pro" : "Try Pro free", href: "/studio/pro" }}
            footnote="Every new business gets 14 days of Pro free. Pay from your Aming card, MTN or Airtel; renews by itself if you want, stop any time."
          />
        </div>

        <section className="mt-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">The page looks</h2>
          <p className="mt-2 text-center text-sm text-muted">A real business&apos;s page in each look.</p>
          <ul className="mt-6 grid gap-6 md:grid-cols-2">
            {PAGE_TEMPLATES.map((t) => (
              <li key={t.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- a fixed picture from public/, shown as is */}
                <img src={t.screenshot} alt={`A business page in the ${t.name} look`} width={1200} height={675} loading="lazy" className="aspect-video w-full border-b border-border object-cover object-top" />
                <div className="space-y-1 p-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{t.name}</h3>
                    {t.pro ? <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-white">Pro</span> : <span className="text-xs text-muted">Free</span>}
                  </div>
                  <p className="text-sm text-muted">{t.summary}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-16 text-center text-sm text-muted">
          Questions?{" "}
          <a href={`https://wa.me/${SUPPORT_PHONE_INTL}`} className="font-medium text-foreground underline underline-offset-4">
            WhatsApp us
          </a>
        </p>
      </main>
    </div>
  );
}

function Plan({
  name,
  price,
  per,
  note,
  lines,
  cta,
  footnote,
  highlight,
}: {
  name: string;
  price: string;
  per: string | null;
  note: string;
  lines: string[];
  cta: { label: string; href: string };
  footnote?: string;
  highlight?: boolean;
}) {
  return (
    <section className={`flex flex-col rounded-3xl border p-6 sm:p-8 ${highlight ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:bg-brand-500/10" : "border-border bg-surface"}`}>
      <h2 className="text-lg font-semibold">{name}</h2>
      <p className="mt-3">
        <span className="text-3xl font-bold tnum sm:text-4xl">{price}</span>
        {per ? <span className="ml-1 text-sm text-muted">{per}</span> : null}
      </p>
      <p className="mt-4 text-sm font-medium">{note}</p>
      <ul className="mt-3 flex-1 space-y-3 text-sm">
        {lines.map((l) => (
          <li key={l} className="flex gap-3">
            <span aria-hidden className="mt-0.5 text-brand-500">
              ✓
            </span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
      <Link
        href={cta.href}
        className={`mt-6 inline-flex min-h-12 items-center justify-center rounded-[var(--radius)] px-5 font-semibold ${highlight ? "bg-brand-500 text-white hover:bg-brand-600" : "border border-border hover:border-foreground"}`}
      >
        {cta.label}
      </Link>
      {footnote ? <p className="mt-4 text-xs text-muted">{footnote}</p> : null}
    </section>
  );
}
