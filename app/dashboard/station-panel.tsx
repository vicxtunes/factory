"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import type { Station } from "@/lib/types";

import { createStation, deleteStation, renameStation } from "./actions";

export function StationPanel({ stations }: { stations: Station[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

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
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await createStation(name);
              if (res.ok) setName("");
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
          <Button variant="primary" type="submit" disabled={pending}>
            Add station
          </Button>
        </form>
        {error ? <p className="mt-3 text-sm text-error-600">{error}</p> : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Station</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Actions</p>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stations.map((s) => (
                <tr key={s.id} className="hover:bg-background">
                  <td className="px-5 py-3">
                    {editingId === s.id ? (
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
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        className="min-h-9 text-xs"
                        disabled={pending}
                        onClick={() => setEditingId(s.id)}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="danger"
                        className="min-h-9 text-xs"
                        disabled={pending}
                        onClick={() => run(() => deleteStation(s.id))}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
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
      <p className="text-xs text-muted">
        Deleting a station clears it from any worker currently set to it.
      </p>
    </div>
  );
}
