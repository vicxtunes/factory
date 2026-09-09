"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import type { Designer } from "@/lib/types";

import { PinReset } from "./pin-reset";
import {
  addDesigner,
  deactivateDesigner,
  reactivateDesigner,
  resetDesignerPin,
} from "./actions";

type DesignerLite = Omit<Designer, "pin_hash">;

export function DesignerPanel({
  designers,
  canManage = true,
}: {
  designers: DesignerLite[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

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
      {canManage ? (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const res = await addDesigner({ name, pin });
                if (res.ok) {
                  setName("");
                  setPin("");
                }
                return res;
              });
            }}
          >
            <Field label="Name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="PIN (4–8 digits)">
              <TextInput
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                inputMode="numeric"
                required
              />
            </Field>
            <div className="flex items-end">
              <Button variant="primary" type="submit" disabled={pending}>
                Add designer
              </Button>
            </div>
          </form>
          {error ? <p className="mt-3 text-sm text-error-600">{error}</p> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Designer</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Status</p>
                </th>
                {canManage ? (
                  <th className="px-5 py-3 font-medium text-muted">
                    <p className="text-xs uppercase tracking-wide">Actions</p>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {designers.map((d) => (
                <tr key={d.id} className="hover:bg-background">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {d.name.charAt(0).toUpperCase()}
                      </span>
                      <span className={d.active ? "font-medium" : "text-muted line-through"}>
                        {d.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        d.active
                          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
                          : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
                      }`}
                    >
                      {d.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage ? (
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {d.active ? (
                          <Button
                            variant="danger"
                            className="min-h-9 text-xs"
                            disabled={pending}
                            onClick={() => run(() => deactivateDesigner(d.id))}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="min-h-9 text-xs"
                            disabled={pending}
                            onClick={() => run(() => reactivateDesigner(d.id))}
                          >
                            Reactivate
                          </Button>
                        )}
                        <PinReset
                          pending={pending}
                          onSave={(pin) => run(() => resetDesignerPin({ id: d.id, pin }))}
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {designers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-center text-muted">
                    No designers yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {canManage ? (
        <p className="text-xs text-muted">
          Deactivating a designer unassigns any order still waiting on their design work.
        </p>
      ) : null}
    </div>
  );
}
