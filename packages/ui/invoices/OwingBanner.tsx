"use client";

import Link from "next/link";

import { clientPath } from "@repo/lib/client-portal/paths";
import type { Owing } from "@repo/lib/invoices/types";

import { useMoney } from "../wallet/shared";

/** "You owe …" on the money pages (home, an invoice, an order's payment): one line and the way to the Wallet, where it's paid. */
export function OwingBanner({ owing }: { owing: Owing }) {
  const money = useMoney();
  return (
    <Link
      href={clientPath("/payment")}
      className="flex items-center justify-between gap-3 rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm print:hidden dark:border-error-500/30 dark:bg-error-500/10"
    >
      <span>
        You owe <span className="font-bold tabular-nums">{money(owing.owed)}</span> on {owing.count} invoice{owing.count === 1 ? "" : "s"}
      </span>
      <span className="shrink-0 font-semibold text-error-700 underline dark:text-error-400">Pay now</span>
    </Link>
  );
}
