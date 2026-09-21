"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { Field, TextInput } from "@/components/ui/Field";
import type { ExportColumn } from "@/lib/export/tableExport";
import type { Agent } from "@/lib/types";

import { addAgent, deactivateAgent, reactivateAgent } from "./actions";

interface AgentExportRow extends Record<string, unknown> {
  name: string;
  status: string;
}

const EXPORT_COLUMNS: ExportColumn<AgentExportRow>[] = [
  { key: "name", label: "Agent" },
  { key: "status", label: "Status" },
];

export function AgentPanel({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  const exportRows: AgentExportRow[] = agents.map((a) => ({
    name: a.name,
    status: a.active ? "Active" : "Inactive",
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ExportButtons columns={EXPORT_COLUMNS} rows={exportRows} filename="agents" />
        <Button variant="primary" onClick={() => setFormOpen(true)}>
          + Add agent
        </Button>
      </div>

      <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Add agent">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await addAgent(name);
              if (res.ok) {
                setName("");
                setFormOpen(false);
              }
              return res;
            });
          }}
        >
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Button variant="primary" type="submit" loading={pending} disabled={pending} className="w-full">
            Add agent
          </Button>
          {error ? <p className="text-sm text-error-600">{error}</p> : null}
        </form>
      </Drawer>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Agent</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Status</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Actions</p>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {agents.map((a) => (
                <tr key={a.id} className="hover:bg-background">
                  <td className="px-5 py-3">
                    <span className={a.active ? "font-medium" : "text-muted line-through"}>
                      {a.name}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        a.active
                          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
                          : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
                      }`}
                    >
                      {a.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {a.active ? (
                      <Button
                        variant="danger"
                        className="min-h-9 text-xs"
                        loading={pending} disabled={pending}
                        onClick={() => run(() => deactivateAgent(a.id))}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        className="min-h-9 text-xs"
                        loading={pending} disabled={pending}
                        onClick={() => run(() => reactivateAgent(a.id))}
                      >
                        Reactivate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {agents.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-center text-muted">
                    No agents yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
