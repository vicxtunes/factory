"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { OrdersIcon, SupportIcon } from "@/app/client-side/sidebar";
import { ChatIcon } from "@/components/chat/icons";

import { GRAPHICS_NAV, isCurrentGraphicsPage, type GraphicsNavItem } from "./nav";

const ICONS: Partial<Record<GraphicsNavItem["icon"], typeof OrdersIcon>> = {
  orders: OrdersIcon,
  chat: ChatIcon,
  support: SupportIcon,
};

// Desktop/tablet only (md+), same look as the client portal's sidebar. On
// phones navigation is the bottom home bar (./shell.tsx).
export function GraphicsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <Image src="/aming-logo-header.png" alt="AMING" width={193} height={40} className="h-7 w-auto" priority />
      </div>
      <nav aria-label="Graphics" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {GRAPHICS_NAV.map((section) => (
          <div key={section.id}>
            {section.label ? (
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{section.label}</p>
            ) : null}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isCurrentGraphicsPage(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch
                      aria-current={active ? "page" : undefined}
                      className={`menu-item ${active ? "menu-item-active" : "menu-item-inactive"}`}
                    >
                      {Icon ? (
                        <Icon className={`h-5 w-5 ${active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`} />
                      ) : null}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
