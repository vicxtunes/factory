"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import type { RoomStatus } from "./registry";
import { StatusPill } from "./status-pill";

interface NavGroup {
  category: string;
  items: { slug: string; name: string; status: RoomStatus }[];
}

const ROOT = "/dashboard/design-room";

// Component list, grouped by category. On phones it folds behind a toggle
// so the page content isn't pushed below a long list. Takes plain data from
// the layout rather than importing the registry, which would pull every
// example into this client bundle.
export function RoomNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="p-3">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <Link href={ROOT} className="text-sm font-semibold" onClick={() => setOpen(false)}>
          Design Room
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-muted hover:bg-gray-100 md:hidden dark:hover:bg-white/5"
        >
          {open ? "Close" : "Components"}
        </button>
      </div>

      <div className={`${open ? "block" : "hidden"} md:block`}>
        {groups.map(({ category, items }) => (
          <div key={category} className="mt-4">
            <p className="px-3 pb-1 text-[0.7rem] font-semibold uppercase tracking-widest text-muted">{category}</p>
            {items.map((c) => {
              const href = `${ROOT}/${c.slug}`;
              return (
                <Link
                  key={c.slug}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`menu-item justify-between ${pathname === href ? "menu-item-active" : "menu-item-inactive"}`}
                >
                  {c.name}
                  {c.status === "draft" ? <StatusPill status="draft" /> : null}
                </Link>
              );
            })}
          </div>
        ))}

        <Link href="/dashboard" className="menu-item menu-item-inactive mt-6 text-muted">
          ← Back to dashboard
        </Link>
      </div>
    </nav>
  );
}
