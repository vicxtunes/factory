import type { ReactNode } from "react";
import Link from "next/link";

import { HomeBar, type HomeBarLink } from "@repo/ui/HomeBar";
import {
  CalendarIcon,
  ClientsIcon,
  DashboardIcon,
  FilesIcon,
  InvoiceIcon,
  PaymentIcon,
  ProductsIcon,
  SettingsIcon,
  TasksIcon,
} from "@repo/ui/icons";
import { studioInitials } from "@repo/lib/studios/core";
import { vendorCategory, type Vendor } from "@repo/lib/vendors/core";

import { logoutClient } from "../actions";
import { LogOut } from "./log-out";

// The vendor side's frame: the menu on wider screens, the tab bar on phones.
// Home, Drive and Profile have pages; the rest of the menu shows what comes.

type Page = "home" | "drive" | "profile";

/** Phones: on the bar; Log out in "More". */
const TABS: HomeBarLink[] = [
  { href: "/vendors", label: "Home", icon: "dashboard", exact: true },
  { href: "/vendors#jobs", label: "Jobs", icon: "tasks" },
  { href: "/vendors/drive", label: "Drive", icon: "files" },
  { href: "/vendors/profile", label: "Profile", icon: "clients" },
];

const NAV: { label: string; Icon: typeof DashboardIcon; href?: string; page?: Page }[] = [
  { label: "Home", Icon: DashboardIcon, href: "/vendors", page: "home" },
  { label: "Drive", Icon: FilesIcon, href: "/vendors/drive", page: "drive" },
  { label: "Profile", Icon: ClientsIcon, href: "/vendors/profile", page: "profile" },
  { label: "Jobs", Icon: TasksIcon },
  { label: "Calendar", Icon: CalendarIcon },
  { label: "Invoices", Icon: InvoiceIcon },
  { label: "Wallet", Icon: PaymentIcon },
  { label: "Rates", Icon: ProductsIcon },
  { label: "Settings", Icon: SettingsIcon },
];

export function VendorFrame({ vendor, page, children }: { vendor: Vendor; page: Page; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-sm font-semibold text-white">{studioInitials(vendor.name)}</span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{vendor.name}</span>
              <span className="block text-xs text-muted">{vendorCategory(vendor.category)?.label ?? "Vendor"}</span>
            </span>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
            {NAV.map(({ label, Icon, href, page: of }) => {
              const look = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                of === page ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : href ? "text-foreground hover:bg-background" : "text-muted"
              }`;
              return href ? (
                <Link key={label} href={href} className={look} aria-current={of === page ? "page" : undefined}>
                  <Icon className="size-5" />
                  {label}
                </Link>
              ) : (
                <span key={label} className={look}>
                  <Icon className="size-5" />
                  {label}
                </span>
              );
            })}
          </nav>
          <div className="border-t border-border p-3">
            <LogOut />
          </div>
        </aside>
        <main className="mx-auto w-full max-w-3xl pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8">{children}</main>
      </div>
      <HomeBar tabs={TABS} logout={logoutClient} afterLogout="/" hideFrom="lg" />
    </div>
  );
}
