"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { getMyOwing } from "@repo/lib/invoices/actions";

/** Whether the signed-in client has unpaid invoices: the dot on Wallet. Asked again on each page, so it goes once they're cleared. */
export function useOwes(signedIn: boolean): boolean {
  const pathname = usePathname();
  const [owes, setOwes] = useState(false);
  useEffect(() => {
    if (!signedIn) return;
    getMyOwing().then((owing) => setOwes(owing !== null), () => {});
  }, [signedIn, pathname]);
  return owes;
}
