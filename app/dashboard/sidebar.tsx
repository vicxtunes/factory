"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AppRole } from "@/lib/types";

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 12h4.5v7.5h-4.5V12ZM9.75 4.5h4.5v15h-4.5v-15ZM15.75 9h4.5v10.5h-4.5V9Z"
      />
    </svg>
  );
}

function OrdersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 4.5h6M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5m-6 0a1.5 1.5 0 0 0 1.5 1.5h3A1.5 1.5 0 0 0 15 4.5m-6 0H6.75A2.25 2.25 0 0 0 4.5 6.75v12A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25v-12A2.25 2.25 0 0 0 17.25 4.5H15"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 11.25h7.5M8.25 15h7.5" />
    </svg>
  );
}

function WorkersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

function AdminsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function ClientsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.964 0a9 9 0 1 0-11.964 0m11.964 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

function AgentsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM3.75 20.25a8.25 8.25 0 0 1 16.5 0"
      />
    </svg>
  );
}

function ProductsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
      />
    </svg>
  );
}

function DisplayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 5.25h16.5v10.5H3.75V5.25ZM8.25 20.25h7.5M12 15.75v4.5"
      />
    </svg>
  );
}

const TABS = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon, role: null, newTab: false },
  { href: "/dashboard/orders", label: "Orders", icon: OrdersIcon, role: null, newTab: false },
  { href: "/dashboard/clients", label: "Clients", icon: ClientsIcon, role: "supervisor", newTab: false },
  { href: "/dashboard/agents", label: "Agents", icon: AgentsIcon, role: "supervisor", newTab: false },
  { href: "/dashboard/products", label: "Products", icon: ProductsIcon, role: "supervisor", newTab: false },
  { href: "/dashboard/workers", label: "Workers", icon: WorkersIcon, role: "supervisor", newTab: false },
  { href: "/dashboard/admins", label: "Admins", icon: AdminsIcon, role: "boss", newTab: false },
  { href: "/display", label: "Display screen", icon: DisplayIcon, role: null, newTab: true },
] as const satisfies {
  href: string;
  label: string;
  icon: typeof DashboardIcon;
  role: AppRole | null;
  newTab: boolean;
}[];

export function DashboardSidebar({
  role,
  mobileOpen,
  onNavigate,
}: {
  role: AppRole;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => t.role === null || t.role === role);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-transform duration-200 lg:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
          A
        </span>
        <span className="text-sm font-semibold">AMING</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted">Menu</p>
        <ul className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  onClick={onNavigate}
                  target={tab.newTab ? "_blank" : undefined}
                  rel={tab.newTab ? "noopener noreferrer" : undefined}
                  className={`menu-item ${active ? "menu-item-active" : "menu-item-inactive"}`}
                >
                  <Icon
                    className={`h-5 w-5 ${active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`}
                  />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
