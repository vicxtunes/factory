"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable, type DataTableColumn } from "@repo/ui/DataTable";
import { ExportButtons } from "@repo/ui/ExportButtons";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { editAgent, registerAgent, waitingForPayFirst } from "@repo/lib/agents/actions";
import type { Agent, AgentListRow } from "@repo/lib/agents/server";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import type { ExportColumn } from "@repo/lib/export/tableExport";

import { WaitingChoice } from "./rates/rates-board";

type Sheet = { kind: "register"; agent: Agent | null } | { kind: "edit"; agent: Agent } | null;

interface ExportRow extends Record<string, unknown> {
  name: string;
  status: string;
  orders: number;
  completed: number;
  sales: number;
  earned: number;
  balance: number;
  withdrawn: number;
}

const EXPORT_COLUMNS: ExportColumn<ExportRow>[] = [
  { key: "name", label: "Agent" },
  { key: "status", label: "Status" },
  { key: "orders", label: "Orders" },
  { key: "completed", label: "Completed" },
  { key: "sales", label: "Sales" },
  { key: "earned", label: "Commission earned" },
  { key: "balance", label: "Balance" },
  { key: "withdrawn", label: "Withdrawn" },
];

const status = (a: Agent) => (!a.active ? "Inactive" : a.clientId ? "Active" : "No login");

/** `payFirstForAll`: the pay-before-production % for agents without their own. */
export function AgentsBoard({ agents, boss, payFirstForAll }: { agents: AgentListRow[]; boss: boolean; payFirstForAll: number }) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [sheet, setSheet] = useState<Sheet>(null);

  const columns: DataTableColumn<AgentListRow>[] = [
    { key: "name", header: "Agent", render: (a) => <Link href={`/dashboard/agents/${a.id}`} className="font-medium text-brand-600 hover:underline">{a.name}</Link> },
    { key: "status", header: "Status", render: status },
    { key: "orders", header: "Orders", align: "right", render: (a) => a.figures.totalOrders },
    { key: "completed", header: "Completed", align: "right", render: (a) => a.figures.completedSales },
    { key: "sales", header: "Sales", align: "right", render: (a) => money(a.salesValue) },
    { key: "earned", header: "Earned", align: "right", render: (a) => money(a.figures.commissionEarned) },
    { key: "balance", header: "Balance", align: "right", render: (a) => money(a.figures.balance) },
    { key: "withdrawn", header: "Withdrawn", align: "right", render: (a) => money(a.figures.withdrawn) },
  ];

  const rows: ExportRow[] = agents.map((a) => ({
    name: a.name,
    status: status(a),
    orders: a.figures.totalOrders,
    completed: a.figures.completedSales,
    sales: a.salesValue,
    earned: a.figures.commissionEarned,
    balance: a.figures.balance,
    withdrawn: a.figures.withdrawn,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ExportButtons columns={EXPORT_COLUMNS} rows={rows} filename="agents" />
        {boss ? (
          <Button variant="primary" onClick={() => setSheet({ kind: "register", agent: null })}>
            + Register agent
          </Button>
        ) : null}
      </div>

      {/* Cards on a phone, a table from md up. */}
      <ul className="grid gap-3 md:hidden">
        {agents.map((a) => (
          <li key={a.id}>
            <Link href={`/dashboard/agents/${a.id}`} className="block rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{a.name}</span>
                <span className="shrink-0 text-xs text-muted">{status(a)}</span>
              </span>
              <span className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                <span>
                  <span className="block text-sm font-semibold text-foreground tnum">{a.figures.totalOrders}</span>Orders
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground tnum">{money(a.figures.commissionEarned)}</span>Earned
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground tnum">{money(a.figures.balance)}</span>Balance
                </span>
              </span>
            </Link>
          </li>
        ))}
        {agents.length === 0 ? <li className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No agents yet.</li> : null}
      </ul>
      <div className="hidden md:block">
        <DataTable columns={columns} rows={agents} rowKey={(a) => a.id} emptyMessage="No agents yet." />
      </div>

      {sheet ? <AgentSheet key={sheet.agent?.id ?? "new"} sheet={sheet} payFirstForAll={payFirstForAll} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

/** Registering an agent, giving an old one a login, or editing one: an empty rate means their category rates apply. */
export function AgentSheet({ sheet, payFirstForAll, onClose }: { sheet: NonNullable<Sheet>; payFirstForAll: number; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(sheet.agent?.name ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState(sheet.agent?.rateOverride?.toString() ?? "");
  const [payFirst, setPayFirst] = useState(sheet.agent?.payFirstOverride?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Their orders already waiting, when their % changes: the boss chooses whether those take the new one.
  const [waiting, setWaiting] = useState<{ count: number; orderNos: string[] } | null>(null);
  const rateOverride = rate.trim() === "" ? null : rate;
  const payFirstOverride = payFirst.trim() === "" ? null : payFirst;
  const payFirstChanged = sheet.kind === "edit" && (payFirstOverride === null ? null : Number(payFirstOverride)) !== sheet.agent.payFirstOverride;

  function saveEdit(choice: "follow" | "keep") {
    if (sheet.kind !== "edit") return;
    setError(null);
    start(async () => {
      const res = await editAgent({ agentId: sheet.agent.id, name, rateOverride, payFirstOverride }, choice);
      if (!res.ok) return setError(res.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <FormSheet open onClose={onClose} title={sheet.kind === "edit" ? "Edit agent" : sheet.agent ? "Give a login" : "Register agent"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (sheet.kind === "edit") {
            if (!payFirstChanged) return saveEdit("follow");
            start(async () => {
              const found = await waitingForPayFirst(sheet.agent.id);
              if (!found.ok) return setError(found.error);
              if (found.data.count > 0) setWaiting(found.data);
              else saveEdit("follow");
            });
            return;
          }
          start(async () => {
            const res = await registerAgent({ agentId: sheet.agent?.id ?? null, name, email, phone, rateOverride });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            onClose();
            router.refresh();
          });
        }}
      >
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        {sheet.kind === "register" ? (
          <>
            <Field label="Email">
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Phone">
              <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
            <p className="text-xs text-muted">We email them how to sign in. If this phone or email is already a client, that account becomes the agent&apos;s login.</p>
          </>
        ) : null}
        <Field label="Their own rate, % (optional)">
          <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Category rates apply" />
        </Field>
        {sheet.kind === "edit" ? (
          <Field label="Their own % to pay before production (optional)">
            <TextInput inputMode="numeric" value={payFirst} onChange={(e) => { setPayFirst(e.target.value); setWaiting(null); }} placeholder="The setting for all agents applies" />
          </Field>
        ) : null}
        {waiting && sheet.kind === "edit" ? (
          <WaitingChoice
            waiting={waiting}
            from={sheet.agent.payFirstOverride ?? payFirstForAll}
            to={payFirstOverride === null ? payFirstForAll : Number(payFirstOverride)}
            busy={pending}
            onChoose={saveEdit}
            onCancel={() => setWaiting(null)}
          />
        ) : null}
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
        <Button variant="primary" type="submit" className="w-full" loading={pending} disabled={pending}>
          Save
        </Button>
      </form>
    </FormSheet>
  );
}
