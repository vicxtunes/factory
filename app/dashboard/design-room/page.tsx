import Link from "next/link";

import { CATEGORIES, COMPONENTS } from "./registry";
import { StatusPill } from "./status-pill";

export default function DesignRoomIndex() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Design Room</h1>
        <p className="mt-1 text-sm text-muted">
          Build and try components here before they go into the app. {COMPONENTS.length} components.
        </p>
      </header>

      {CATEGORIES.map((category) => (
        <section key={category}>
          <h2 className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-muted">{category}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {COMPONENTS.filter((c) => c.category === category).map(({ slug, name, status, examples }) => {
              const Preview = examples[0].Demo;
              return (
                <Link
                  key={slug}
                  href={`/dashboard/design-room/${slug}`}
                  className="group overflow-hidden rounded-[var(--radius)] border border-border bg-surface shadow-theme-xs transition-shadow hover:shadow-theme-md"
                >
                  {/* Live preview, inert so the card stays one big link. */}
                  <div inert className="flex h-40 items-center justify-center overflow-hidden bg-background p-4">
                    <div className="origin-center scale-75">
                      <Preview />
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border px-4 py-3">
                    <span className="text-sm font-medium group-hover:text-brand-600">{name}</span>
                    <StatusPill status={status} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
