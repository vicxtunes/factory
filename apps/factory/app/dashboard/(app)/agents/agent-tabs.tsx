"use client";

import { usePathname, useRouter } from "next/navigation";

import { Tabs } from "@repo/ui/Tabs";

type Section = "/dashboard/agents" | "/dashboard/agents/clients" | "/dashboard/agents/withdrawals" | "/dashboard/agents/rates";

/** The Agents area's sections. Withdrawals and rates are the boss's. */
export function AgentTabs({ boss }: { boss: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const tabs: { key: Section; label: string }[] = [
    { key: "/dashboard/agents", label: "Agents" },
    { key: "/dashboard/agents/clients", label: "Clients to check" },
    ...(boss
      ? ([
          { key: "/dashboard/agents/withdrawals", label: "Withdrawals" },
          { key: "/dashboard/agents/rates", label: "Rates & settings" },
        ] as const)
      : []),
  ];
  return <Tabs<Section> label="Agents" tabs={tabs} value={tabs.some((t) => t.key === pathname) ? (pathname as Section) : "/dashboard/agents"} onChange={(key) => router.push(key)} />;
}
