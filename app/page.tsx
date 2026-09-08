import Link from "next/link";

import { Header } from "@/components/ui/Header";
import { SectionLabel } from "@/components/ui/SectionLabel";

const SURFACES = [
  {
    href: "/intake",
    title: "Intake",
    who: "Receptionist",
    desc: "Log new orders and their line items.",
  },
  {
    href: "/factory",
    title: "Factory",
    who: "Production workers",
    desc: "Mobile production queue — update status, flag delays, mark complete.",
  },
  {
    href: "/dashboard",
    title: "Dashboard",
    who: "Supervisor & boss",
    desc: "Full visibility, worker management, live notification feed.",
  },
  {
    href: "/display",
    title: "Display screen",
    who: "Factory TV",
    desc: "Big-screen production board, colored by status. No login needed.",
  },
];

export default function Home() {
  return (
    <>
      <Header surface="Home" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <SectionLabel>Choose a screen</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SURFACES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs transition-colors hover:border-brand-500"
            >
              <p className="text-base font-semibold">{s.title}</p>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-muted">
                {s.who}
              </p>
              <p className="mt-2 text-sm text-muted">{s.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
