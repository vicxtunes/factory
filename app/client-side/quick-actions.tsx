import Link from "next/link";

import { OrdersIcon, PlaceOrderIcon, ShowroomIcon } from "./sidebar";

// The three things a client most often comes to the portal to do, one tap
// away at the top of the dashboard (above the metrics and charts). "Add order"
// is the primary action, so it's the filled brand card.
const ACTIONS = [
  { href: "/client-side/new", label: "Add order", icon: PlaceOrderIcon, primary: true },
  { href: "/client-side/showroom", label: "Showroom", icon: ShowroomIcon, primary: false },
  { href: "/client-side/orders", label: "Track orders", icon: OrdersIcon, primary: false },
] as const;

export function QuickActions() {
  return (
    <nav aria-label="Quick actions" className="grid grid-cols-3 gap-3">
      {ACTIONS.map(({ href, label, icon: Icon, primary }) => (
        <Link
          key={href}
          href={href}
          className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center shadow-theme-xs transition-colors ${
            primary
              ? "border-brand-600 bg-brand-600 text-white hover:bg-brand-700"
              : "border-border bg-surface text-foreground hover:bg-gray-50 dark:hover:bg-white/5"
          }`}
        >
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              primary ? "bg-white/20" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
            }`}
          >
            <Icon className="h-6 w-6" />
          </span>
          <span className="text-xs font-semibold sm:text-sm">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
