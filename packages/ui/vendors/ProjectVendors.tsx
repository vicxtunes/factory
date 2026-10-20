"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Avatar } from "@repo/ui/Avatar";
import { FormSheet } from "@repo/ui/FormSheet";
import { Button, buttonClass } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import {
  approveVendorJob,
  cancelVendorJob,
  disputeVendorJob,
  findVendors,
  fundVendorJob,
  requestVendor,
  setVendorJobFolder,
  type VendorCard,
} from "@repo/lib/vendors/actions";
import { autoReleaseAt, isOpenJob, JOB_STATUS_LABELS, offerPrice, offerTotal, rateUnit, VENDOR_CATEGORIES, vendorCategory, vendorTake, type JobStatus, type RateUnit } from "@repo/lib/vendors/core";

/** One vendor job on the project, as the studio sees it. */
export interface ProjectJob {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorCategory: string;
  photoUrl: string | null;
  brief: string;
  samplesWanted: string | null;
  dueOn: string | null;
  price: number;
  status: JobStatus;
  /** The folder the vendor works in; null: it was deleted. */
  folderId: string | null;
  deliveredAt: string | null;
  disputeReason: string | null;
}

/** A folder in the project's, for the vendor to work in ("Wedding / Raw"). */
export interface ProjectFolder {
  id: string;
  label: string;
}

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

const STATUS_LOOK: Record<JobStatus, string> = {
  requested: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  samples: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  samples_sent: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  awaiting_funds: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  in_progress: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  delivered: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  disputed: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500",
  paid: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  refunded: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  declined: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
};

type Sheet = { kind: "fund" | "approve" | "dispute"; job: ProjectJob } | null;

/**
 * The vendors working on a project. Each job shows where it is and what the
 * studio can do now: cancel before money is held, review samples and pay in
 * to Aming to go ahead, approve delivered work (Aming releases the money to
 * the vendor) or raise a dispute. Paying (`canPay`) is the Money area's.
 * Adding a vendor: find them, the folder they work in, samples or not, and
 * what's needed, by when, for how much. Coming from a vendor's page
 * (`hire`), the form opens with them chosen, at one of their services
 * (`hireService`) when one was picked.
 */
export function ProjectVendors({
  projectId,
  jobs,
  folders,
  canPay,
  hire,
  hireService,
}: {
  projectId: string;
  jobs: ProjectJob[];
  folders: ProjectFolder[];
  canPay: boolean;
  hire: VendorCard | null;
  hireService: string | null;
}) {
  const router = useRouter();
  const openJobs = jobs.filter((j) => isOpenJob(j.status)).map((j) => j.vendorId);
  const [adding, setAdding] = useState(hire !== null);
  // A job with no folder (made before jobs had them, or its folder was deleted): the studio gives it one.
  const [givingFolder, setGivingFolder] = useState<ProjectJob | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function act(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      setSheet(null);
      setReason("");
      router.refresh();
    });
  }


  return (
    <div className="space-y-3">
      {jobs.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {jobs.map((j) => {
            const release = autoReleaseAt(j);
            return (
              <li key={j.id} className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={j.vendorName} src={j.photoUrl ?? undefined} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate font-semibold">
                        {j.vendorName} <span className="font-normal text-muted">· {vendorCategory(j.vendorCategory)?.label ?? "Vendor"}</span>
                      </p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_LOOK[j.status]}`}>{JOB_STATUS_LABELS[j.status]}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted">{j.brief}</p>
                    <p className="mt-1 text-xs text-muted">
                      {money(j.price)}
                      {j.dueOn ? ` · due ${new Date(`${j.dueOn}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                      {j.status === "in_progress" || j.status === "delivered" || j.status === "disputed" ? " · held by Aming" : ""}
                    </p>
                    {release ? (
                      <p className="mt-1 text-xs text-muted">
                        Released to them {new Date(release).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })} if you don&apos;t answer.
                      </p>
                    ) : null}
                    {!j.folderId && isOpenJob(j.status) ? (
                      <p className="mt-2 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
                        No folder: {j.vendorName} can&apos;t reach any files for this job. Give them one.
                      </p>
                    ) : null}
                    {j.status === "disputed" && j.disputeReason ? <p className="mt-1 text-xs text-error-600 dark:text-error-400">Dispute: &ldquo;{j.disputeReason}&rdquo; Aming is looking into it.</p> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:pl-14">
                  {j.status === "samples_sent" && canPay ? <Button onClick={() => setSheet({ kind: "fund", job: j })}>Approve samples and pay in</Button> : null}
                  {j.status === "awaiting_funds" && canPay ? <Button onClick={() => setSheet({ kind: "fund", job: j })}>Pay in to start</Button> : null}
                  {j.status === "delivered" && canPay ? <Button onClick={() => setSheet({ kind: "approve", job: j })}>Approve and release</Button> : null}
                  {!j.folderId && isOpenJob(j.status) ? (
                    <Button variant="secondary" onClick={() => setGivingFolder(j)}>
                      Give a folder
                    </Button>
                  ) : null}
                  {j.folderId && isOpenJob(j.status) ? (
                    <Link href={`/studio/files?folder=${j.folderId}`} className={buttonClass("secondary", "sm")}>
                      {j.status === "samples_sent" ? "See the samples" : "Open their folder"}
                    </Link>
                  ) : null}
                  {["requested", "samples", "samples_sent", "awaiting_funds"].includes(j.status) ? (
                    <Button size="sm" variant="danger" type="button" disabled={pending} onClick={() => act(() => cancelVendorJob(j.id))}>
                      {j.status === "samples_sent" ? "Not good: cancel" : "Cancel"}
                    </Button>
                  ) : null}
                  {j.status === "in_progress" || j.status === "delivered" ? (
                    <Button size="sm" variant="danger" type="button" onClick={() => setSheet({ kind: "dispute", job: j })}>
                      Raise a dispute
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
          No vendors yet. Hire a photo editor, videographer or other vendor to work on this project.
        </p>
      )}
      {error && !sheet ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button variant="secondary" onClick={() => setAdding(true)}>
        Add a vendor
      </Button>

      {adding ? (
        <AddVendor
          projectId={projectId}
          folders={folders}
          openJobs={openJobs}
          // Already working on the project: the list shows them as such.
          initial={hire && !openJobs.includes(hire.id) ? hire : null}
          initialService={hireService}
          onClose={() => {
            setAdding(false);
            // Not opened again on the next refresh.
            if (hire) router.replace(`/studio/projects/${projectId}?tab=vendors`, { scroll: false });
          }}
        />
      ) : null}

      {givingFolder ? <GiveFolder job={givingFolder} folders={folders} onClose={() => setGivingFolder(null)} /> : null}

      {sheet ? (
        <FormSheet
          open
          onClose={() => setSheet(null)}
          title={sheet.kind === "fund" ? (sheet.job.status === "samples_sent" ? "Approve samples and pay in" : "Pay in to start") : sheet.kind === "approve" ? "Approve and release" : "Raise a dispute"}
        >
          <div className="space-y-4 text-sm">
            {sheet.kind === "dispute" ? (
              <>
                <p className="text-muted">Aming holds the money until it&apos;s settled: staff look at the work and release it to {sheet.job.vendorName} or refund you.</p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="What's wrong with the work?"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  autoFocus
                />
              </>
            ) : (
              <>
                <p className="text-muted">
                  {sheet.kind === "fund"
                    ? `Aming holds the money while ${sheet.job.vendorName} works: it's released to them when you approve the delivered work, or refunded if things go wrong.`
                    : `Aming releases the money it holds to ${sheet.job.vendorName}.`}
                </p>
                <dl className="divide-y divide-border rounded-xl border border-border">
                  <div className="flex justify-between px-4 py-2.5">
                    <dt className="text-muted">{sheet.kind === "fund" ? "From your Business card" : "Held by Aming"}</dt>
                    <dd className="font-semibold tabular-nums">{money(sheet.job.price)}</dd>
                  </div>
                  <div className="flex justify-between px-4 py-2.5">
                    <dt className="text-muted">{sheet.job.vendorName} receives</dt>
                    <dd className="tabular-nums">{money(vendorTake(sheet.job.price))}</dd>
                  </div>
                </dl>
              </>
            )}
            {error ? <p className="text-error-600 dark:text-error-400">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSheet(null)} disabled={pending}>
                Not yet
              </Button>
              <Button
                loading={pending}
                disabled={sheet.kind === "dispute" && reason.trim().length < 5}
                onClick={() =>
                  act(() =>
                    sheet.kind === "fund" ? fundVendorJob(sheet.job.id) : sheet.kind === "approve" ? approveVendorJob(sheet.job.id) : disputeVendorJob(sheet.job.id, reason),
                  )
                }
              >
                {sheet.kind === "fund" ? `Pay in ${money(sheet.job.price)}` : sheet.kind === "approve" ? "Release the money" : "Raise the dispute"}
              </Button>
            </div>
          </div>
        </FormSheet>
      ) : null}
    </div>
  );
}

/** Find a vendor, then where they work, samples or not, and what's needed, by when and for how much. */
function AddVendor({
  projectId,
  folders,
  openJobs,
  initial,
  initialService,
  onClose,
}: {
  projectId: string;
  folders: ProjectFolder[];
  openJobs: string[];
  initial: VendorCard | null;
  initialService: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [found, setFound] = useState<VendorCard[] | null>(null);
  const [chosen, setChosen] = useState<VendorCard | null>(initial);
  // Hiring at a service picked on their page: that service, its price for one, and its name as the brief's start.
  const picked = initial ? pricedOffers(initial).findIndex((o) => o.id === initialService) : -1;
  const atService = picked >= 0 ? pricedOffers(initial!)[picked]! : null;
  const [brief, setBrief] = useState(atService?.name ?? "");
  const [dueOn, setDueOn] = useState("");
  const [price, setPrice] = useState(atService ? offerTotal(atService, 1).toLocaleString("en-US") : "");
  // One of their priced services ("" for a price agreed here), and how many of its unit.
  const [rate, setRate] = useState(picked >= 0 ? String(picked) : "");
  const [quantity, setQuantity] = useState("1");
  // Where they work: "new" (a folder made for them) or an existing folder's id.
  const [folder, setFolder] = useState("new");
  const [folderName, setFolderName] = useState("");
  const [samples, setSamples] = useState(false);
  const [samplesWanted, setSamplesWanted] = useState("");
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

  const textArea = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

  return (
    <FormSheet open onClose={onClose} title={chosen ? `Hire ${chosen.name}` : "Add a vendor"}>
      {chosen ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await requestVendor({
                projectId,
                vendorId: chosen.id,
                brief,
                samplesWanted: samples ? samplesWanted : "",
                dueOn,
                price: price.replace(/[^\d]/g, ""),
                folder: folder === "new" ? { kind: "new", name: folderName.trim() || `For ${chosen.name}` } : { kind: "existing", folderId: folder },
              });
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
              className={textArea}
              required
              autoFocus
            />
          </Field>
          {pricedOffers(chosen).length ? (
            <div className="space-y-2">
              <Field label="At their price">
                <select
                  value={rate}
                  onChange={(e) => {
                    setRate(e.target.value);
                    const picked = pricedOffers(chosen)[Number(e.target.value)];
                    if (!picked || e.target.value === "") return;
                    setPrice(offerTotal(picked, Number(quantity) || 1).toLocaleString("en-US"));
                    if (!brief.trim()) setBrief(picked.name);
                  }}
                  className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                >
                  <option value="">No, agree a price</option>
                  {pricedOffers(chosen).map((o, i) => (
                    <option key={i} value={i}>
                      {o.name}: {offerPrice(o)}
                    </option>
                  ))}
                </select>
              </Field>
              {rate !== "" && pricedOffers(chosen)[Number(rate)]!.unit !== "project" ? (
                <Field label={`How many ${rateUnit(pricedOffers(chosen)[Number(rate)]!.unit).many}`}>
                  <TextInput
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => {
                      const n = e.target.value.replace(/[^\d]/g, "");
                      setQuantity(n);
                      setPrice(offerTotal(pricedOffers(chosen)[Number(rate)]!, Number(n) || 1).toLocaleString("en-US"));
                    }}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due">
              <TextInput type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
            <Field label="Price (UGX)">
              <TextInput inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="300,000" required />
            </Field>
          </div>
          <Field label="Their folder" hint="The only folder of this project they'll see.">
            <select value={folder} onChange={(e) => setFolder(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm">
              <option value="new">A new folder for them</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          {folder === "new" ? <TextInput value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder={`For ${chosen.name}`} maxLength={120} aria-label="New folder's name" /> : null}
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} className="mt-0.5 size-4 accent-brand-500" />
            <span>
              <span className="block text-sm font-medium">Ask for samples first</span>
              <span className="block text-xs text-muted">See a few before going ahead. Nothing is paid until you approve them.</span>
            </span>
          </label>
          {samples ? (
            <textarea value={samplesWanted} onChange={(e) => setSamplesWanted(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Edit these 5 photos in our style." className={textArea} required />
          ) : null}
          <p className="text-xs text-muted">When the work goes ahead you pay in to Aming from your Business card. Aming holds it until you approve the work.</p>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="secondary" onClick={() => setChosen(null)} disabled={pending}>
              Back
            </Button>
            <Button type="submit" loading={pending} disabled={brief.trim().length < 3 || !price || (samples && samplesWanted.trim().length < 3)}>
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
    </FormSheet>
  );
}

/** Gives a job the folder its vendor works in: one of the project's, or a new one. */
function GiveFolder({ job, folders, onClose }: { job: ProjectJob; folders: ProjectFolder[]; onClose: () => void }) {
  const router = useRouter();
  const [folder, setFolder] = useState("new");
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <FormSheet open onClose={onClose} title={`A folder for ${job.vendorName}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await setVendorJobFolder(job.id, folder === "new" ? { kind: "new", name: folderName.trim() || `For ${job.vendorName}` } : { kind: "existing", folderId: folder });
            if (!res.ok) return setError(res.error);
            onClose();
            router.refresh();
          });
        }}
      >
        <Field label="Their folder" hint="The only folder of this project they'll see.">
          <select value={folder} onChange={(e) => setFolder(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm">
            <option value="new">A new folder for them</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        {folder === "new" ? <TextInput value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder={`For ${job.vendorName}`} maxLength={120} aria-label="New folder's name" /> : null}
        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Not now
          </Button>
          <Button type="submit" loading={pending}>
            Give the folder
          </Button>
        </div>
      </form>
    </FormSheet>
  );
}

/** The vendor's services with a price, to hire at one. */
function pricedOffers(vendor: VendorCard): { id: string; name: string; price: number; unit: RateUnit }[] {
  return vendor.offers.flatMap((o) => (o.price !== null && o.unit !== null ? [{ id: o.id, name: o.name, price: o.price, unit: o.unit }] : []));
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
