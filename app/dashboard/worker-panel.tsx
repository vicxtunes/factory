"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import type { Station, Worker } from "@/lib/types";

import { PinReset } from "./pin-reset";
import {
  addWorker,
  deactivateWorker,
  reactivateWorker,
  resetWorkerPin,
  updateWorker,
} from "./actions";

type WorkerLite = Omit<Worker, "pin_hash">;

export function WorkerPanel({
  workers,
  stations,
}: {
  workers: WorkerLite[];
  stations: Station[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [station, setStation] = useState("");

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
          className="grid gap-3 sm:grid-cols-[1fr_120px_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await addWorker({ name, pin, station });
              if (res.ok) {
                setName("");
                setPin("");
                setStation("");
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
          <Field label="Station">
            <Select value={station} onChange={(e) => setStation(e.target.value)}>
              <option value="">No station</option>
              {stations.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button variant="primary" type="submit" disabled={pending}>
              Add worker
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
                  <p className="text-xs uppercase tracking-wide">Worker</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Station</p>
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
              {workers.map((w) => (
                <tr key={w.id} className="hover:bg-background">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {w.name.charAt(0).toUpperCase()}
                      </span>
                      <span className={w.active ? "font-medium" : "text-muted line-through"}>
                        {w.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      defaultValue={w.station ?? ""}
                      className="min-h-9 w-36 rounded-[var(--radius)] border border-border bg-surface px-2 text-xs"
                      onChange={(e) => {
                        run(() => updateWorker({ id: w.id, station: e.target.value }));
                      }}
                    >
                      <option value="">No station</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        w.active
                          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
                          : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
                      }`}
                    >
                      {w.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {w.active ? (
                        <Button
                          variant="danger"
                          className="min-h-9 text-xs"
                          disabled={pending}
                          onClick={() => run(() => deactivateWorker(w.id))}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          className="min-h-9 text-xs"
                          disabled={pending}
                          onClick={() => run(() => reactivateWorker(w.id))}
                        >
                          Reactivate
                        </Button>
                      )}
                      <PinReset
                        pending={pending}
                        onSave={(pin) => run(() => resetWorkerPin({ id: w.id, pin }))}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {workers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-muted">
                    No workers yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-muted">
        Deactivating a worker unassigns their items automatically.
      </p>
    </div>
  );
}
