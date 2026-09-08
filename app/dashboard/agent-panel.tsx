"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import type { Agent } from "@/lib/types";

import { addAgent, deactivateAgent, reactivateAgent } from "./actions";

export function AgentPanel({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await addAgent(name);
              if (res.ok) setName("");
              return res;
            });
          }}
        >
          <div className="flex-1">
            <Field label="Name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
          </div>
          <div className="flex items-end">
            <Button variant="primary" type="submit" disabled={pending}>
              Add agent
            </Button>
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-error-600">{error}</p> : null}
      </div>

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
                        disabled={pending}
                        onClick={() => run(() => deactivateAgent(a.id))}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        className="min-h-9 text-xs"
                        disabled={pending}
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
