"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { Field, TextInput } from "@/components/ui/Field";
import type { ExportColumn } from "@/lib/export/tableExport";
import type { Designer } from "@/lib/types";

import { PinReset } from "./pin-reset";
import {
  addDesigner,
  deactivateDesigner,
  reactivateDesigner,
  resetDesignerPin,
} from "./actions";

type DesignerLite = Omit<Designer, "pin_hash">;

interface DesignerExportRow extends Record<string, unknown> {
  name: string;
  status: string;
}

const EXPORT_COLUMNS: ExportColumn<DesignerExportRow>[] = [
  { key: "name", label: "Designer" },
  { key: "status", label: "Status" },
];

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
  const [formOpen, setFormOpen] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  const exportRows: DesignerExportRow[] = designers.map((d) => ({
    name: d.name,
    status: d.active ? "Active" : "Inactive",
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ExportButtons columns={EXPORT_COLUMNS} rows={exportRows} filename="designers" />
        {canManage ? (
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            + Add designer
          </Button>
        ) : null}
      </div>

      {canManage ? (
        <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Add designer">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const res = await addDesigner({ name, pin });
                if (res.ok) {
                  setName("");
                  setPin("");
                  setFormOpen(false);
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
            <Button variant="primary" type="submit" loading={pending} disabled={pending} className="w-full">
              Add designer
            </Button>
            {error ? <p className="text-sm text-error-600">{error}</p> : null}
          </form>
        </Drawer>
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
                            loading={pending} disabled={pending}
                            onClick={() => run(() => deactivateDesigner(d.id))}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="min-h-9 text-xs"
                            loading={pending} disabled={pending}
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
