import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { categoryRates, feePaidBy, payFirstForAll } from "@repo/lib/agents/server";
import { getDashboardSession } from "@repo/lib/auth/session";

import { AgentTabs } from "../agent-tabs";
import { RatesBoard } from "./rates-board";

export const dynamic = "force-dynamic";

export default async function AgentRatesPage() {
  const session = await getDashboardSession();
  if (session?.role !== "boss") redirect("/dashboard/agents");
  const [rates, paidBy, payFirst] = await Promise.all([categoryRates(), feePaidBy(), payFirstForAll()]);
  return (
    <div className="space-y-6">
      <SectionLabel>Agents</SectionLabel>
      <AgentTabs boss />
      <RatesBoard rates={rates} feePaidBy={paidBy} payFirstPercent={payFirst} />
    </div>
  );
}
