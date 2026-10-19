"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Avatar } from "@repo/ui/Avatar";
import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { cancelVendorJob, findVendors, payVendorJob, requestVendor, type VendorCard } from "@repo/lib/vendors/actions";
import { JOB_STATUS_LABELS, VENDOR_CATEGORIES, isOpenJob, jobFee, vendorCategory, type JobStatus } from "@repo/lib/vendors/core";

/** One vendor job on the project, as the studio sees it. */
export interface ProjectJob {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorCategory: string;
  photoUrl: string | null;
  brief: string;
  dueOn: string | null;
  price: number;
  status: JobStatus;
}

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

const STATUS_LOOK: Record<JobStatus, string> = {
  requested: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  accepted: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  delivered: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  paid: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  declined: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
};

/**
 * The vendors working on a project: each job with where it is, cancelling an
 * open one, approving and paying a delivered one (`canPay`: the money area),
 * and adding a vendor (search, then what's needed, by when, for how much).
 */
export function ProjectVendors({ projectId, jobs, canPay }: { projectId: string; jobs: ProjectJob[]; canPay: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<ProjectJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function act(work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {jobs.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Avatar name={j.vendorName} src={j.photoUrl ?? undefined} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {j.vendorName} <span className="font-normal text-muted">· {vendorCategory(j.vendorCategory)?.label ?? "Vendor"}</span>
                  </p>
                  <p className="line-clamp-2 text-sm text-muted">{j.brief}</p>
                  <p className="mt-1 text-xs text-muted">
                    {money(j.price)}
                    {j.dueOn ? ` · due ${new Date(`${j.dueOn}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_LOOK[j.status]}`}>{JOB_STATUS_LABELS[j.status]}</span>
                {j.status === "delivered" && canPay ? (
                  <Button className="ml-auto sm:ml-0" disabled={pending} onClick={() => setPaying(j)}>
                    Approve and pay
                  </Button>
                ) : null}
                {(j.status === "requested" || j.status === "accepted") && (
                  <button type="button" disabled={pending} onClick={() => act(() => cancelVendorJob(j.id))} className="ml-auto text-xs font-medium text-muted hover:text-error-600 sm:ml-0">
                    Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
          No vendors yet. Hire a photo editor, videographer or other vendor to work on this project.
        </p>
      )}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button variant="secondary" onClick={() => setAdding(true)}>
        Add a vendor
      </Button>

      {adding ? <AddVendor projectId={projectId} openJobs={jobs.filter((j) => isOpenJob(j.status)).map((j) => j.vendorId)} onClose={() => setAdding(false)} /> : null}

      {paying ? (
        <BottomSheet open onClose={() => setPaying(null)} title="Approve and pay">
          <div className="space-y-4 text-sm">
            <p>
              {paying.vendorName} delivered the work. Check it in the project&apos;s folder, then pay from your Business card.
            </p>
            <dl className="divide-y divide-border rounded-xl border border-border">
              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-muted">You pay</dt>
                <dd className="font-semibold tabular-nums">{money(paying.price)}</dd>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-muted">{paying.vendorName} receives</dt>
                <dd className="tabular-nums">{money(paying.price - jobFee(paying.price))}</dd>
              </div>
            </dl>
            {error ? <p className="text-error-600 dark:text-error-400">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPaying(null)} disabled={pending}>
                Not yet
              </Button>
              <Button loading={pending} onClick={() => act(() => payVendorJob(paying.id), () => setPaying(null))}>
                Pay {money(paying.price)}
              </Button>
            </div>
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}

/** Find a vendor, then say what's needed, by when and for how much. */
function AddVendor({ projectId, openJobs, onClose }: { projectId: string; openJobs: string[]; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [found, setFound] = useState<VendorCard[] | null>(null);
  const [chosen, setChosen] = useState<VendorCard | null>(null);
  const [brief, setBrief] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Searches as they type, a moment after they stop.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const res = await findVendors({ query, category });
      if (res.ok) setFound(res.data);
      else setError(res.error);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, category]);

  return (
    <BottomSheet open onClose={onClose} title={chosen ? `Hire ${chosen.name}` : "Add a vendor"}>
      {chosen ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await requestVendor({ projectId, vendorId: chosen.id, brief, dueOn, price: price.replace(/[^\d]/g, "") });
              if (!res.ok) return setError(res.error);
              onClose();
              router.refresh();
            });
          }}
        >
          <VendorRow vendor={chosen} />
          <Field label="What's needed">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Colour and skin retouch on 300 wedding photos, our usual warm look."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              required
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due">
              <TextInput type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
            <Field label="Price (UGX)">
              <TextInput inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="300,000" required />
            </Field>
          </div>
          <p className="text-xs text-muted">They see the job and the project&apos;s folder once they accept. You pay from your Business card when the work is delivered.</p>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="secondary" onClick={() => setChosen(null)} disabled={pending}>
              Back
            </Button>
            <Button type="submit" loading={pending} disabled={brief.trim().length < 3 || !price}>
              Send request
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendors by name" autoFocus aria-label="Search vendors" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 shrink-0 rounded-lg border border-border bg-surface px-2 text-sm" aria-label="What they do">
              <option value="">All</option>
              {VENDOR_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          {found === null ? (
            <p className="py-6 text-center text-sm text-muted">Searching…</p>
          ) : found.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No vendors found.</p>
          ) : (
            <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {found.map((v) => {
                const busy = openJobs.includes(v.id);
                return (
                  <li key={v.id}>
                    <button type="button" disabled={busy} onClick={() => setChosen(v)} className="w-full p-3 text-left hover:bg-background disabled:opacity-50">
                      <VendorRow vendor={v} note={busy ? "Already on this project" : undefined} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function VendorRow({ vendor, note }: { vendor: VendorCard; note?: string }) {
  return (
    <span className="flex items-center gap-3">
      <Avatar name={vendor.name} src={vendor.photoUrl ?? undefined} size="lg" />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{vendor.name}</span>
        <span className="block truncate text-xs text-muted">
          {[vendorCategory(vendor.category)?.label, vendor.location, note ?? vendor.skills.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}
        </span>
      </span>
    </span>
  );
}
