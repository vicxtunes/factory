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
  requestRental,
  requestVendor,
  setVendorJobFolder,
  type VendorCard,
} from "@repo/lib/vendors/actions";
import {
  autoReleaseAt,
  isOpenJob,
  JOB_STAGE_LABELS,
  jobStage,
  offerPrice,
  offerTotal,
  rateUnit,
  RENTAL_UNITS,
  rentalPrice,
  VENDOR_CATEGORIES,
  vendorCategory,
  vendorTake,
  type JobStage,
  type JobStatus,
  type RateUnit,
  type Rental,
} from "@repo/lib/vendors/core";
import { checkMobileMoneyPayment, payVendorJobWithMobileMoney } from "@repo/lib/wallet/actions";

/** One vendor job of the studio's, as it sees it. */
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
  /** The folder the vendor works in; null: a rental, or it was deleted. */
  folderId: string | null;
  deliveredAt: string | null;
  disputeReason: string | null;
  /** Equipment hired: what, how many, which days; null for a service. */
  rental: Rental | null;
  handedOverAt: string | null;
  /** The project it's for, on the studio's Jobs page; null: none. */
  projectTitle: string | null;
}

/** A folder the vendor can be given ("Wedding / Raw"): in the project's, or in Drive → Jobs. */
export interface ProjectFolder {
  id: string;
  label: string;
}

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** A vendor that hires out equipment: their jobs are rentals. */
const hiresEquipment = (vendor: { category: string }) => vendor.category === "equipment_hire";

const STAGE_LOOK: Record<JobStage, string> = {
  requested: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  working: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  delivered: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  closed: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400",
};

type Sheet = { kind: "fund" | "approve" | "dispute"; job: ProjectJob } | null;

/**
 * A studio's vendor jobs: a project's (`projectId`), or all of them on the
 * Jobs page (null), where hiring puts a job on no project, in a folder of its
 * own in Drive → Jobs. Each job shows where it is and what the studio can do
 * now: cancel before money is held, review samples and pay in to Aming (from
 * the Business card, or by mobile money), approve delivered work or returned
 * equipment (Aming releases the money to the vendor), or raise a dispute.
 * Paying (`canPay`) is the Money area's. Hiring: find a vendor, then for a
 * service the folder they work in, samples or not, and what's needed, by
 * when, for how much; for equipment, the item, how many and the days. Coming
 * from a vendor's page (`hire`), the form opens with them chosen, at one of
 * their services (`hireService`) when one was picked; closing it goes to
 * `returnTo`.
 */
export function ProjectVendors({
  projectId,
  jobs,
  folders,
  canPay,
  hire,
  hireService,
  returnTo,
}: {
  projectId: string | null;
  jobs: ProjectJob[];
  folders: ProjectFolder[];
  canPay: boolean;
  hire: VendorCard | null;
  hireService: string | null;
  returnTo: string;
}) {
  const router = useRouter();
  // On a project, a vendor has one open job at a time.
  const openJobs = projectId ? jobs.filter((j) => isOpenJob(j.status)).map((j) => j.vendorId) : [];
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
            const needsFolder = !j.rental && !j.folderId && isOpenJob(j.status);
            return (
              <li key={j.id} className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={j.vendorName} src={j.photoUrl ?? undefined} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate font-semibold">
                        {j.vendorName} <span className="font-normal text-muted">· {vendorCategory(j.vendorCategory)?.label ?? "Vendor"}</span>
                      </p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_LOOK[jobStage(j.status)]}`}>{JOB_STAGE_LABELS[jobStage(j.status)]}</span>
                    </div>
                    {projectId === null ? <p className="text-xs font-medium text-brand-600 dark:text-brand-400">{j.projectTitle ?? "No project"}</p> : null}
                    <p className="line-clamp-2 text-sm text-muted">
                      {j.rental ? `${j.rental.quantity} × ${j.rental.item}, ${shortDay(j.rental.startsOn)} to ${shortDay(j.rental.endsOn)}` : j.brief}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {money(j.price)}
                      {!j.rental && j.dueOn ? ` · due ${shortDay(j.dueOn)}` : ""}
                      {j.status === "in_progress" || j.status === "delivered" || j.status === "disputed" ? " · held by Aming" : ""}
                      {j.rental && j.status === "in_progress" ? (j.handedOverAt ? " · with you" : " · waiting to be handed over") : ""}
                    </p>
                    {release ? (
                      <p className="mt-1 text-xs text-muted">
                        Released to them {new Date(release).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })} if you don&apos;t answer.
                      </p>
                    ) : null}
                    {needsFolder ? (
                      <p className="mt-2 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
                        No folder: {j.vendorName} can&apos;t reach any files for this job. Give them one.
                      </p>
                    ) : null}
                    {j.status === "disputed" && j.disputeReason ? <p className="mt-1 text-xs text-error-600 dark:text-error-400">Dispute: &ldquo;{j.disputeReason}&rdquo; Aming is looking into it.</p> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:pl-14">
                  {j.status === "samples_sent" && canPay ? <Button onClick={() => setSheet({ kind: "fund", job: j })}>Approve samples and pay in</Button> : null}
                  {j.status === "awaiting_funds" && canPay ? <Button onClick={() => setSheet({ kind: "fund", job: j })}>{j.rental ? "Pay in to book it" : "Pay in to start"}</Button> : null}
                  {j.status === "delivered" && canPay ? <Button onClick={() => setSheet({ kind: "approve", job: j })}>{j.rental ? "Approve the return" : "Approve and release"}</Button> : null}
                  {needsFolder ? (
                    <Button variant="secondary" onClick={() => setGivingFolder(j)}>
                      Give a folder
                    </Button>
                  ) : null}
                  {!j.rental && j.folderId && isOpenJob(j.status) ? (
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
          {projectId
            ? "No vendors yet. Hire a photo editor, videographer or other vendor to work on this project."
            : "No vendor jobs yet. Hire a vendor for work that isn't on a project, or hire equipment, from here or from Vendors."}
        </p>
      )}
      {error && !sheet ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button variant="secondary" onClick={() => setAdding(true)}>
        {projectId ? "Add a vendor" : "Hire a vendor"}
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
            if (hire) router.replace(returnTo, { scroll: false });
          }}
        />
      ) : null}

      {givingFolder ? <GiveFolder job={givingFolder} folders={folders} onProject={projectId !== null} onClose={() => setGivingFolder(null)} /> : null}

      {sheet?.kind === "fund" ? <PayIn job={sheet.job} onClose={() => setSheet(null)} /> : null}

      {sheet && sheet.kind !== "fund" ? (
        <FormSheet open onClose={() => setSheet(null)} title={sheet.kind === "approve" ? (sheet.job.rental ? "Approve the return" : "Approve and release") : "Raise a dispute"}>
          <div className="space-y-4 text-sm">
            {sheet.kind === "dispute" ? (
              <>
                <p className="text-muted">
                  Aming holds the money until it&apos;s settled: staff look into it and release it to {sheet.job.vendorName} or refund you.
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder={sheet.job.rental ? "What's wrong (not handed over, not working, late…)?" : "What's wrong with the work?"}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  autoFocus
                />
              </>
            ) : (
              <>
                <p className="text-muted">
                  {sheet.job.rental ? `The equipment is back with ${sheet.job.vendorName}: Aming releases what it holds to them.` : `Aming releases the money it holds to ${sheet.job.vendorName}.`}
                </p>
                <dl className="divide-y divide-border rounded-xl border border-border">
                  <div className="flex justify-between px-4 py-2.5">
                    <dt className="text-muted">Held by Aming</dt>
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
                onClick={() => act(() => (sheet.kind === "approve" ? approveVendorJob(sheet.job.id) : disputeVendorJob(sheet.job.id, reason)))}
              >
                {sheet.kind === "approve" ? "Release the money" : "Raise the dispute"}
              </Button>
            </div>
          </div>
        </FormSheet>
      ) : null}
    </div>
  );
}

/** Mobile money takes 500 to 5,000,000 a prompt. */
const MOBILE_MONEY_MIN = 500;
const MOBILE_MONEY_MAX = 5_000_000;

/**
 * Paying a job in to Aming: from the Business card, or by mobile money (a
 * prompt on the phone, then waiting for it to go through). Either way the
 * studio pays the price; Aming holds it for the job.
 */
function PayIn({ job, onClose }: { job: ProjectJob; onClose: () => void }) {
  const router = useRouter();
  const [how, setHow] = useState<"card" | "mobile">("card");
  const [phone, setPhone] = useState("");
  const [waiting, setWaiting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const mobileOk = job.price >= MOBILE_MONEY_MIN && job.price <= MOBILE_MONEY_MAX;

  // While the prompt is on the phone: ask every few seconds how it's going.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      const res = await checkMobileMoneyPayment(waiting);
      if (!res.ok) return;
      if (res.data.status === "succeeded") {
        clearInterval(timer);
        onClose();
        router.refresh();
      } else if (res.data.status === "failed") {
        clearInterval(timer);
        setWaiting(null);
        setError(res.data.failureReason ?? "The payment didn't go through. Nothing was taken: you can try again.");
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [waiting, onClose, router]);

  return (
    <FormSheet open onClose={onClose} title={job.status === "samples_sent" ? "Approve samples and pay in" : "Pay in"}>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Aming holds the money{job.rental ? " for the hire" : ` while ${job.vendorName} works`}: it&apos;s released to them when you approve, or refunded to your Business card if things go
          wrong.
        </p>
        <dl className="divide-y divide-border rounded-xl border border-border">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-muted">You pay</dt>
            <dd className="font-semibold tabular-nums">{money(job.price)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-muted">{job.vendorName} receives</dt>
            <dd className="tabular-nums">{money(vendorTake(job.price))}</dd>
          </div>
        </dl>

        {waiting ? (
          <div className="space-y-2 rounded-xl bg-brand-50 p-4 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <p className="font-semibold">Check your phone</p>
            <p>Approve the mobile money prompt for {money(job.price)} with your PIN. This updates by itself once it goes through.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
              {(["card", "mobile"] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={how === h}
                  disabled={h === "mobile" && !mobileOk}
                  onClick={() => setHow(h)}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${how === h ? "bg-surface shadow-theme-xs" : "text-muted hover:text-foreground"}`}
                >
                  {h === "card" ? "Business card" : "Mobile money"}
                </button>
              ))}
            </div>
            {how === "mobile" ? (
              <Field label="MTN or Airtel number" hint="A prompt comes to this phone: approve it with your PIN.">
                <TextInput type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" required />
              </Field>
            ) : (
              <p className="text-xs text-muted">Taken from your Business card now. Not enough on it? Choose mobile money.</p>
            )}
            {!mobileOk ? <p className="text-xs text-muted">Mobile money takes {money(MOBILE_MONEY_MIN)} to {money(MOBILE_MONEY_MAX)} at a time: pay this one from your Business card.</p> : null}
          </>
        )}
        {error ? <p className="text-error-600 dark:text-error-400">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {waiting ? "Close" : "Not yet"}
          </Button>
          {waiting ? null : (
            <Button
              loading={pending}
              disabled={how === "mobile" && !phone.trim()}
              onClick={() => {
                setError(null);
                start(async () => {
                  if (how === "card") {
                    const res = await fundVendorJob(job.id);
                    if (!res.ok) return setError(res.error);
                    onClose();
                    router.refresh();
                    return;
                  }
                  const res = await payVendorJobWithMobileMoney(job.id, phone);
                  if (!res.ok) return setError(res.error);
                  setWaiting(res.data.id);
                });
              }}
            >
              {how === "card" ? `Pay in ${money(job.price)}` : `Send the prompt`}
            </Button>
          )}
        </div>
      </div>
    </FormSheet>
  );
}

/** Find a vendor, then what's hired from them: a service (where they work, samples or not, what, by when, how much) or equipment (the item, how many, the days). */
function AddVendor({
  projectId,
  folders,
  openJobs,
  initial,
  initialService,
  onClose,
}: {
  projectId: string | null;
  folders: ProjectFolder[];
  openJobs: string[];
  initial: VendorCard | null;
  initialService: string | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [found, setFound] = useState<VendorCard[] | null>(null);
  const [chosen, setChosen] = useState<VendorCard | null>(initial);
  const [error, setError] = useState<string | null>(null);

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
    <FormSheet open onClose={onClose} title={chosen ? `Hire ${chosen.name}` : "Hire a vendor"}>
      {chosen ? (
        hiresEquipment(chosen) ? (
          <RentalForm projectId={projectId} vendor={chosen} initialItem={chosen === initial ? initialService : null} onBack={() => setChosen(null)} onDone={onClose} />
        ) : (
          <ServiceForm
            projectId={projectId}
            folders={folders}
            vendor={chosen}
            initialService={chosen === initial ? initialService : null}
            onBack={() => setChosen(null)}
            onDone={onClose}
          />
        )
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

const textArea = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/** A service: what's needed, at their price or one agreed, by when, the folder they work in, and samples or not. */
function ServiceForm({
  projectId,
  folders,
  vendor,
  initialService,
  onBack,
  onDone,
}: {
  projectId: string | null;
  folders: ProjectFolder[];
  vendor: VendorCard;
  initialService: string | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  // Hiring at a service picked on their page: that service, its price for one, and its name as the brief's start.
  const picked = pricedOffers(vendor).findIndex((o) => o.id === initialService);
  const atService = picked >= 0 ? pricedOffers(vendor)[picked]! : null;
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

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await requestVendor({
            projectId,
            vendorId: vendor.id,
            brief,
            samplesWanted: samples ? samplesWanted : "",
            dueOn,
            price: price.replace(/[^\d]/g, ""),
            folder: folder === "new" ? { kind: "new", name: folderName.trim() || `For ${vendor.name}` } : { kind: "existing", folderId: folder },
          });
          if (!res.ok) return setError(res.error);
          onDone();
          router.refresh();
        });
      }}
    >
      <VendorRow vendor={vendor} />
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
      {pricedOffers(vendor).length ? (
        <div className="space-y-2">
          <Field label="At their price">
            <select
              value={rate}
              onChange={(e) => {
                setRate(e.target.value);
                const offer = pricedOffers(vendor)[Number(e.target.value)];
                if (!offer || e.target.value === "") return;
                setPrice(offerTotal(offer, Number(quantity) || 1).toLocaleString("en-US"));
                if (!brief.trim()) setBrief(offer.name);
              }}
              className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
            >
              <option value="">No, agree a price</option>
              {pricedOffers(vendor).map((o, i) => (
                <option key={i} value={i}>
                  {o.name}: {offerPrice(o)}
                </option>
              ))}
            </select>
          </Field>
          {rate !== "" && pricedOffers(vendor)[Number(rate)]!.unit !== "project" ? (
            <Field label={`How many ${rateUnit(pricedOffers(vendor)[Number(rate)]!.unit).many}`}>
              <TextInput
                inputMode="numeric"
                value={quantity}
                onChange={(e) => {
                  const n = e.target.value.replace(/[^\d]/g, "");
                  setQuantity(n);
                  setPrice(offerTotal(pricedOffers(vendor)[Number(rate)]!, Number(n) || 1).toLocaleString("en-US"));
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
      <Field label="Their folder" hint={projectId ? "The only folder of this project they'll see." : "In Drive → Jobs: the only folder of yours they'll see."}>
        <select value={folder} onChange={(e) => setFolder(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm">
          <option value="new">A new folder for them</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      {folder === "new" ? <TextInput value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder={`For ${vendor.name}`} maxLength={120} aria-label="New folder's name" /> : null}
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
      <p className="text-xs text-muted">When the work goes ahead you pay in to Aming, from your Business card or by mobile money. Aming holds it until you approve the work.</p>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button type="submit" loading={pending} disabled={brief.trim().length < 3 || !price || (samples && samplesWanted.trim().length < 3)}>
          Send request
        </Button>
      </div>
    </form>
  );
}

/** Equipment: which item (priced per day, week or month), how many, and the days; the price follows. */
function RentalForm({
  projectId,
  vendor,
  initialItem,
  onBack,
  onDone,
}: {
  projectId: string | null;
  vendor: VendorCard;
  initialItem: string | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const items = pricedOffers(vendor).filter((o) => (RENTAL_UNITS as readonly string[]).includes(o.unit) || o.unit === "item");
  const [itemId, setItemId] = useState(items.find((o) => o.id === initialItem)?.id ?? items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const item = items.find((o) => o.id === itemId);
  const count = Number(quantity) || 0;
  const total = item && count > 0 && startsOn && endsOn && endsOn >= startsOn ? rentalPrice(item, count, startsOn, endsOn) : null;

  if (!items.length) {
    return (
      <div className="space-y-4">
        <VendorRow vendor={vendor} />
        <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">{vendor.name} hasn&apos;t priced any equipment yet.</p>
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await requestRental({ projectId, vendorId: vendor.id, offerId: itemId, quantity, startsOn, endsOn, note });
          if (!res.ok) return setError(res.error);
          onDone();
          router.refresh();
        });
      }}
    >
      <VendorRow vendor={vendor} />
      <Field label="What to hire">
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm">
          {items.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}: {offerPrice(o)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="How many">
        <TextInput inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <TextInput type="date" min={today} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
        </Field>
        <Field label="To (returned by)">
          <TextInput type="date" min={startsOn || today} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />
        </Field>
      </div>
      <Field label="Anything to add" hint="Optional: where to collect it, what it's for…">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className={textArea} />
      </Field>
      <dl className="divide-y divide-border rounded-xl border border-border text-sm">
        <div className="flex justify-between px-4 py-2.5">
          <dt className="text-muted">Price</dt>
          <dd className="font-semibold tabular-nums">{total === null ? "Choose the days" : money(total)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">Once {vendor.name} accepts, you pay in to Aming (Business card or mobile money). It&apos;s released to them after the equipment is back and you approve.</p>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button type="submit" loading={pending} disabled={total === null}>
          Send hire request
        </Button>
      </div>
    </form>
  );
}

/** Gives a job the folder its vendor works in: one of the project's (or of Drive → Jobs), or a new one. */
function GiveFolder({ job, folders, onProject, onClose }: { job: ProjectJob; folders: ProjectFolder[]; onProject: boolean; onClose: () => void }) {
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
        <Field label="Their folder" hint={onProject ? "The only folder of this project they'll see." : "In Drive → Jobs: the only folder of yours they'll see."}>
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
