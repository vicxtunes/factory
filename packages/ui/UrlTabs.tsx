"use client";

import { usePathname, useRouter } from "next/navigation";

import { Tabs, type TabItem } from "./Tabs";

/**
 * The page's sections as Tabs, the chosen one in the address (?tab=…), so the
 * page renders (and loads) only that one and a link can open any of them.
 * The first tab is the page's own address.
 */
export function UrlTabs<K extends string>({ tabs, value, label }: { tabs: TabItem<K>[]; value: K; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Tabs
      tabs={tabs}
      value={value}
      label={label}
      onChange={(key) => router.replace(key === tabs[0]?.key ? pathname : `${pathname}?tab=${key}`, { scroll: false })}
    />
  );
}
