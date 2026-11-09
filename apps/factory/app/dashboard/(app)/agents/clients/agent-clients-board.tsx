"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable, type DataTableColumn } from "@repo/ui/DataTable";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { findMergeTargets, mergeAgentClient, moveAgentClient } from "@repo/lib/agents/actions";
import type { AgentClientListRow, MergeTarget } from "@repo/lib/agents/server";
import { matchReasonLabel } from "@repo/lib/clients/match";

import { updateClient } from "../../../actions";

type Sheet = { kind: "edit" | "merge" | "move"; client: AgentClientListRow } | null;

const contacts = (c: { phone: string | null; email: string | null }) => [c.phone, c.email].filter(Boolean).join(" · ");

/**
 * Everyone on an agent's list. Many were already on Aming under another record
 * (often with no phone or email), so the boss fixes their contacts or merges
 * them into that record; they stay the agent's client either way.
 */
export function AgentClientsBoard({ clients, agents, boss }: { clients: AgentClientListRow[]; agents: { id: string; name: string }[]; boss: boolean }) {
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const q = query.trim().toLowerCase();
  const shown = q ? clients.filter((c) => [c.name, c.phone, c.email, c.agentName].some((v) => v?.toLowerCase().includes(q))) : clients;
  const noContacts = clients.filter((c) => !c.phone && !c.email).length;

  const actions = (c: AgentClientListRow) =>
    boss ? (
      <span className="flex flex-wrap gap-2">
        <Button variant="secondary" className="min-h-9 text-xs" onClick={() => setSheet({ kind: "edit", client: c })}>
          Edit
        </Button>
        <Button variant="secondary" className="min-h-9 text-xs" onClick={() => setSheet({ kind: "merge", client: c })}>
          Merge
        </Button>
        <Button variant="secondary" className="min-h-9 text-xs" onClick={() => setSheet({ kind: "move", client: c })}>
          Change agent
        </Button>
      </span>
    ) : null;

  const columns: DataTableColumn<AgentClientListRow>[] = [
    { key: "name", header: "Client", render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "contacts", header: "Contacts", render: (c) => contacts(c) || <span className="text-warning-700 dark:text-warning-500">None</span> },
    { key: "agent", header: "Agent", render: (c) => c.agentName },
    { key: "orders", header: "Orders", align: "right", render: (c) => c.orders },
    ...(boss ? [{ key: "actions", header: "", render: actions }] : []),
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Agents&apos; clients</h2>
          <p className="text-xs text-muted">
            {clients.length} {clients.length === 1 ? "client" : "clients"}
            {noContacts ? ` · ${noContacts} with no phone or email` : ""}
          </p>
        </div>
        <div className="sm:w-72">
          <TextInput type="search" aria-label="Search agents' clients" placeholder="Search name, phone or agent" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {/* Cards on a phone, a table from md up. */}
      <ul className="grid gap-3 md:hidden">
        {shown.map((c) => (
          <li key={c.clientId} className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
            <div className="min-w-0">
              <p className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{c.name}</span>
                <span className="shrink-0 text-xs text-muted">{c.orders} {c.orders === 1 ? "order" : "orders"}</span>
              </p>
              <p className={`truncate text-sm ${contacts(c) ? "text-muted" : "text-warning-700 dark:text-warning-500"}`}>{contacts(c) || "No phone or email"}</p>
              <p className="truncate text-xs text-muted">{c.agentName}&apos;s client</p>
            </div>
            {actions(c)}
          </li>
        ))}
        {shown.length === 0 ? <li className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{q ? "No client matches." : "No agent has a client yet."}</li> : null}
      </ul>
      <div className="hidden md:block">
        <DataTable columns={columns} rows={shown} rowKey={(c) => c.clientId} emptyMessage={q ? "No client matches." : "No agent has a client yet."} />
      </div>

      {sheet?.kind === "edit" ? <EditSheet key={sheet.client.clientId} client={sheet.client} onClose={() => setSheet(null)} /> : null}
      {sheet?.kind === "merge" ? <MergeSheet key={sheet.client.clientId} client={sheet.client} onClose={() => setSheet(null)} /> : null}
      {sheet?.kind === "move" ? <MoveSheet key={sheet.client.clientId} client={sheet.client} agents={agents} onClose={() => setSheet(null)} /> : null}
    </section>
  );
}

function EditSheet({ client, onClose }: { client: AgentClientListRow; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <FormSheet open onClose={onClose} title="Edit client">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await updateClient({ id: client.clientId, name, phone, email });
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
        <Field label="Phone">
          <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <p className="text-xs text-muted">If another client already has this phone or email, they&apos;re the same person: use Merge instead.</p>
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
        <Button variant="primary" type="submit" className="w-full" loading={pending} disabled={pending}>
          Save
        </Button>
      </form>
    </FormSheet>
  );
}

function MergeSheet({ client, onClose }: { client: AgentClientListRow; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState(client.name);
  const [targets, setTargets] = useState<MergeTarget[] | null>(null);
  const [picked, setPicked] = useState<MergeTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, search] = useTransition();
  const [merging, merge] = useTransition();

  // Searched as they type, starting with the client's own name.
  useEffect(() => {
    const timer = setTimeout(
      () =>
        search(async () => {
          const res = await findMergeTargets(client.clientId, query);
          if (res.ok) setTargets(res.data ?? []);
          else setError(res.error);
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, [client.clientId, query]);

  const fills = picked ? [!picked.phone && client.phone ? "phone" : null, !picked.email && client.email ? "email" : null].filter(Boolean) : [];

  return (
    <FormSheet open onClose={onClose} title={`Merge ${client.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {client.agentName} registered {client.name}
          {contacts(client) ? ` (${contacts(client)})` : ""}. Find the same person already on Aming.
        </p>
        <Field label="Search by name, phone or email">
          <TextInput
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
          />
        </Field>

        {targets === null || (searching && !targets.length) ? (
          <p className="text-sm text-muted">Searching…</p>
        ) : targets.length ? (
          <ul className="space-y-2">
            {targets.map((t) => (
              <li key={t.id}>
                <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${picked?.id === t.id ? "border-brand-500 bg-brand-50 dark:bg-brand-500/15" : "border-border"}`}>
                  <input type="radio" name="merge-into" className="mt-1" checked={picked?.id === t.id} onChange={() => setPicked(t)} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="block truncate text-xs text-muted">{contacts(t) || "No phone or email"}</span>
                    <span className="block text-xs text-muted">
                      Same {matchReasonLabel(t.matchReason)}
                      {t.agentName ? ` · ${t.agentName}'s client` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No one on Aming matches.</p>
        )}

        {picked ? (
          <div className="space-y-1 rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">
            <p>
              {client.name}&apos;s {client.orders} {client.orders === 1 ? "order" : "orders"}, payments and chats move to {picked.name}, who stays {client.agentName}&apos;s client.
              {fills.length ? ` The ${fills.join(" and ")} ${client.agentName} entered fill${fills.length === 1 ? "s" : ""} in what ${picked.name} is missing.` : ""}
            </p>
            <p className="font-medium">{client.name} is then removed. This can&apos;t be undone.</p>
          </div>
        ) : null}

        {error ? <p className="text-sm text-error-600">{error}</p> : null}
        <Button
          variant="primary"
          className="w-full"
          loading={merging}
          disabled={!picked || merging}
          onClick={() =>
            merge(async () => {
              setError(null);
              const res = await mergeAgentClient(client.clientId, picked!.id);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              onClose();
              router.refresh();
            })
          }
        >
          {picked ? `Merge into ${picked.name}` : "Pick who they are"}
        </Button>
      </div>
    </FormSheet>
  );
}

function MoveSheet({ client, agents, onClose }: { client: AgentClientListRow; agents: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const others = agents.filter((a) => a.id !== client.agentId);
  const [agentId, setAgentId] = useState(others[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <FormSheet open onClose={onClose} title="Change agent">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await moveAgentClient(client.clientId, agentId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            onClose();
            router.refresh();
          });
        }}
      >
        <p className="text-sm text-muted">
          {client.name} is {client.agentName}&apos;s client. Orders already placed stay with the agent who placed them.
        </p>
        <Field label="New agent">
          <Select value={agentId} onChange={(e) => setAgentId(e.target.value)} required>
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
        <Button variant="primary" type="submit" className="w-full" loading={pending} disabled={pending || !agentId}>
          Save
        </Button>
      </form>
    </FormSheet>
  );
}
