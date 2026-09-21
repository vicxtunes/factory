"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { TextInput } from "@/components/ui/Field";
import type { ExportColumn } from "@/lib/export/tableExport";
import type { Station } from "@/lib/types";

import { createStation, deleteStation, renameStation } from "./actions";

interface StationExportRow extends Record<string, unknown> {
  name: string;
}

const EXPORT_COLUMNS: ExportColumn<StationExportRow>[] = [{ key: "name", label: "Station" }];

export function StationPanel({
  stations,
  canManage = true,
}: {
  stations: Station[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  const exportRows: StationExportRow[] = stations.map((s) => ({ name: s.name }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ExportButtons columns={EXPORT_COLUMNS} rows={exportRows} filename="stations" />
        {canManage ? (
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            + Add station
          </Button>
        ) : null}
      </div>

      {canManage ? (
        <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Add station">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const res = await createStation(name);
                if (res.ok) {
                  setName("");
                  setFormOpen(false);
                }
                return res;
              });
            }}
          >
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New station name"
              required
            />
            <Button variant="primary" type="submit" loading={pending} disabled={pending} className="w-full">
              Add station
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
                  <p className="text-xs uppercase tracking-wide">Station</p>
                </th>
                {canManage ? (
                  <th className="px-5 py-3 font-medium text-muted">
                    <p className="text-xs uppercase tracking-wide">Actions</p>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stations.map((s) => (
                <tr key={s.id} className="hover:bg-background">
                  <td className="px-5 py-3">
                    {canManage && editingId === s.id ? (
                      <input
                        autoFocus
                        defaultValue={s.name}
                        className="min-h-9 w-40 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
                        onBlur={(e) => {
                          setEditingId(null);
                          if (e.target.value.trim() && e.target.value !== s.name) {
                            run(() => renameStation(s.id, e.target.value));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    ) : (
                      <span className="font-medium">{s.name}</span>
                    )}
                  </td>
                  {canManage ? (
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="min-h-9 text-xs"
                          loading={pending} disabled={pending}
                          onClick={() => setEditingId(s.id)}
                        >
                          Rename
                        </Button>
                        <Button
                          variant="danger"
                          className="min-h-9 text-xs"
                          loading={pending} disabled={pending}
                          onClick={() => run(() => deleteStation(s.id))}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {stations.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-5 py-6 text-center text-muted">
                    No stations yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {canManage ? (
        <p className="text-xs text-muted">
          Deleting a station clears it from any worker currently set to it.
        </p>
      ) : null}
    </div>
  );
}
