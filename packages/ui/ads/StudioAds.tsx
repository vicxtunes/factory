"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FormSheet } from "@repo/ui/FormSheet";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { StepForm } from "@repo/ui/StepForm";
import { useSteps } from "@repo/ui/Stepper";
import { adPhotoChoices, adServices, findInterests, findPlaces, myAds, pauseAd, startAd, stopAd } from "@repo/lib/ads/actions";
import { AD_STATUS_LABEL, adPrice, isLive, type AdInterest, type AdPlace, type AdStatus, type StudioAd } from "@repo/lib/ads/core";

// My Business → Social Media → Ads (packages/lib/ads): what each ad cost and
// brought (people reached, taps, people who wrote, bookings), and a new ad in
// three steps with a preview of how it shows on Facebook / Instagram.

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Kampala" });

const TONE: Record<AdStatus, string> = {
  starting: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  in_review: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  running: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  paused: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  ended: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  stopped: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500",
  rejected: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500",
  failed: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500",
};

type Info = { ads: StudioAd[]; canStart: boolean; balance: number | null; feePercent: number; minDaily: number; pageName: string | null };

export function StudioAds() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => myAds().then((res) => (res.ok ? setInfo(res.data!) : setError(res.error))), []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="py-10 text-center text-sm text-muted">{error}</p>;
  const ads = info?.ads ?? [];
  const spent = ads.reduce((s, a) => s + a.spend, 0);
  const wrote = ads.reduce((s, a) => s + a.leads, 0);
  const booked = ads.reduce((s, a) => s + a.booked, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ads</h1>
          <p className="text-sm text-muted">On Facebook & Instagram · people land on your page and message you</p>
        </div>
        {info?.canStart ? (
          <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
            <span aria-hidden>📣</span> New ad
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={info ? ugx(spent) : "–"} label="Spent" small />
        <Stat value={info ? wrote : "–"} label="People wrote" />
        <Stat value={info ? (wrote ? ugx(spent / wrote) : "–") : "–"} label="Per message" small />
        <Stat value={info ? booked : "–"} label="Booked" tone="text-success-600 dark:text-success-500" />
      </div>

      {!info ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />
          ))}
        </div>
      ) : !ads.length ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-14 text-center">
          <p className="text-4xl" aria-hidden>
            📣
          </p>
          <p className="mt-2 font-semibold">No ads yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Pick a photo, a town and a budget. If an ad spends and nobody writes, it stops by itself and the rest comes back.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ads.map((a) => (
            <AdCard key={a.id} ad={a} onChanged={load} onError={setError} />
          ))}
        </ul>
      )}

      {creating && info ? (
        <NewAd
          info={info}
          onClose={() => setCreating(false)}
          onStarted={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

/** Before Aming's ad account is connected: how ads work, and that they open soon. */
export function AdsComingSoon() {
  const steps = [
    ["🖼️", "Pick a photo", "From your albums or a service, with a headline and a few words."],
    ["📍", "Choose who sees it", "Towns, ages and interests, like weddings or parenting."],
    ["💳", "Set a budget", "So much a day for so many days, from your Aming card. What isn't spent comes back."],
    ["💬", "Get messages", "People tap, land on your page and message you. Alexis answers at once."],
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ads</h1>
          <p className="text-sm text-muted">On Facebook & Instagram · people land on your page and message you</p>
        </div>
        <span className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-xl bg-gray-200 px-4 text-sm font-semibold text-gray-500 dark:bg-white/10" aria-disabled>
          <span aria-hidden>📣</span> New ad
        </span>
      </div>
      <div className="rounded-2xl border border-warning-100 bg-warning-25 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-500">⏳ Ads open soon. Aming is finishing the setup with Facebook.</div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([icon, title, text], i) => (
          <li key={title} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
            <p className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden>
                {icon}
              </span>
              <span className="text-xs font-semibold text-muted">STEP {i + 1}</span>
            </p>
            <p className="mt-2 font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">If an ad spends and nobody writes, it stops by itself and the rest of your money comes back.</p>
    </div>
  );
}

function Stat({ value, label, tone, small }: { value: number | string; label: string; tone?: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <p className={`${small ? "text-xl sm:text-2xl" : "text-3xl"} truncate font-extrabold tnum ${tone ?? ""}`}>{value}</p>
      <p className="mt-1 truncate text-sm text-muted">{label}</p>
    </div>
  );
}

function AdCard({ ad, onChanged, onError }: { ad: StudioAd; onChanged: () => void; onError: (e: string) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (run: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const res = await run();
    setBusy(false);
    if (!res.ok) onError(res.error ?? "It couldn't be done.");
    else onChanged();
  };
  const used = ad.budget ? Math.min(100, Math.round((ad.spend / ad.budget) * 100)) : 0;
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
      <div className="relative aspect-[16/9] bg-gray-100 dark:bg-white/5">
        {ad.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed link to the business's photo
          <img src={ad.photoUrl} alt="" className="size-full object-cover" />
        ) : null}
        <span className={`absolute top-2 left-2 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[ad.status]}`}>{AD_STATUS_LABEL[ad.status]}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="line-clamp-1 font-semibold">{ad.title}</p>
          <p className="text-xs text-muted">
            {day(ad.startsAt)} – {day(ad.endsAt)} · {ad.places.map((p) => p.name.split(",")[0]).join(", ")}
          </p>
        </div>
        <div>
          <div className="flex justify-between text-xs">
            <span className="font-medium tnum">{ugx(ad.spend)}</span>
            <span className="text-muted tnum">of {ugx(ad.budget)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${used}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1 text-center">
          {[
            ["Reached", ad.reach],
            ["Taps", ad.clicks],
            ["Wrote", ad.leads],
            ["Booked", ad.booked],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-xl bg-background px-1 py-2">
              <p className="text-lg font-bold tnum">{Number(n).toLocaleString("en-UG")}</p>
              <p className="text-[11px] text-muted">{label}</p>
            </div>
          ))}
        </div>
        {ad.stopReason && !isLive(ad.status) ? <p className="text-xs text-muted">{ad.stopReason}</p> : null}
        {ad.refunded ? <p className="text-xs font-medium text-success-700 dark:text-success-500">{ugx(ad.refunded)} back on your Aming card</p> : null}
        {isLive(ad.status) ? (
          <div className="mt-auto flex gap-2 border-t border-border pt-3 text-sm">
            {ad.status === "paused" ? (
              <button type="button" disabled={busy} onClick={() => act(() => pauseAd(ad.id, false))} className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border border-border font-medium hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-white/5">
                ▶ Resume
              </button>
            ) : ad.status === "running" || ad.status === "in_review" ? (
              <button type="button" disabled={busy} onClick={() => act(() => pauseAd(ad.id, true))} className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border border-border font-medium hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-white/5">
                ⏸ Pause
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => act(() => stopAd(ad.id))} className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border border-border font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:hover:bg-error-500/10">
              ■ Stop
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

// ── New ad ────────────────────────────────────────────────────────────────

type Album = { albumId: string; title: string; photos: { id: string; thumbUrl: string }[] };
const STEPS = ["Photo & words", "Who sees it", "Budget"] as const;

function NewAd({ info, onClose, onStarted }: { info: Info; onClose: () => void; onStarted: () => void }) {
  const steps = useSteps(STEPS.length, false);
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [services, setServices] = useState<{ slug: string; name: string }[]>([]);
  const [service, setService] = useState("");
  const [photo, setPhoto] = useState<{ albumId: string; id: string; url: string } | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [places, setPlaces] = useState<AdPlace[]>([]);
  const [ageMin, setAgeMin] = useState(21);
  const [ageMax, setAgeMax] = useState(45);
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [interests, setInterests] = useState<AdInterest[]>([]);
  const [daily, setDaily] = useState(Math.max(info.minDaily, 15000));
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void adPhotoChoices().then((r) => setAlbums(r.ok ? r.data! : []));
    void adServices().then((r) => (r.ok ? setServices(r.data!) : null));
  }, []);

  const price = adPrice(daily, days, info.feePercent);
  const short = info.balance !== null && info.balance < price.total;

  function submit() {
    setError(null);
    if (steps.step === 0 && (!photo || !title.trim() || !body.trim())) return setError("Pick a photo and write the headline and text.");
    if (steps.step === 1 && !places.length) return setError("Pick at least one town.");
    if (!steps.last) return steps.next();
    if (daily < info.minDaily) return setError(`The smallest daily budget is ${ugx(info.minDaily)}.`);
    if (!photo) return steps.go(0);
    setPending(true);
    void startAd({ serviceSlug: service || null, title, body, albumId: photo.albumId, photoId: photo.id, places, ageMin, ageMax, gender, interests, dailyBudget: daily, days }).then((res) => {
      setPending(false);
      if (res.ok) onStarted();
      else setError(res.error);
    });
  }

  return (
    <FormSheet open onClose={onClose} title="New ad" size="lg">
      <StepForm
        titles={STEPS}
        steps={{ ...steps, next: submit }}
        heading={steps.step === 0 ? "What people see" : steps.step === 1 ? "Who sees it" : "How much, for how long"}
        submitLabel={`Start ad · ${ugx(price.total)}`}
        pending={pending}
        error={error}
        onSubmit={submit}
      >
        {steps.step === 0 ? (
          <>
            <Field label="It leads to">
              <Select value={service} onChange={(e) => setService(e.target.value)}>
                <option value="">My page</option>
                {services.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Photo</p>
              {!albums ? (
                <div className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
              ) : !albums.length ? (
                <p className="text-sm text-muted">Add photos to a public album or a service&apos;s gallery first.</p>
              ) : (
                <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                  {albums.map((a) => (
                    <div key={a.albumId}>
                      <p className="mb-1 text-xs text-muted">{a.title}</p>
                      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                        {a.photos.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPhoto({ albumId: a.albumId, id: p.id, url: p.thumbUrl })}
                            className={`aspect-square overflow-hidden rounded-lg ring-offset-2 ring-offset-surface ${photo?.id === p.id ? "ring-3 ring-brand-500" : "hover:opacity-80"}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- a signed link to the business's photo */}
                            <img src={p.thumbUrl} alt="" className="size-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Field label="Headline" hint={`${title.length}/40 is best`}>
              <TextInput value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Book your wedding shoot for December" />
            </Field>
            <Field label="Text">
              <TextArea value={body} maxLength={1000} rows={3} onChange={(e) => setBody(e.target.value)} placeholder="Beautiful photos that last forever. Packages from UGX 1,500,000 — message us to check your date." />
            </Field>
          </>
        ) : steps.step === 1 ? (
          <>
            <Picker<AdPlace> label="Towns (about 25 km around each)" placeholder="Kampala, Entebbe, Mbarara…" picked={places} setPicked={setPlaces} search={findPlaces} keyOf={(p) => p.key} nameOf={(p) => p.name} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Age from">
                <TextInput type="number" min={13} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} />
              </Field>
              <Field label="Age to">
                <TextInput type="number" min={13} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} />
              </Field>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Who</p>
              <div className="grid grid-cols-3 gap-2">
                {(["all", "female", "male"] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGender(g)} className={`min-h-10 rounded-xl border text-sm font-medium ${gender === g ? "border-brand-500 bg-brand-25 text-brand-700 dark:bg-brand-500/10" : "border-border"}`}>
                    {g === "all" ? "Everyone" : g === "female" ? "Women" : "Men"}
                  </button>
                ))}
              </div>
            </div>
            <Picker<AdInterest> label="Interested in (optional)" placeholder="Weddings, engagement, parenting…" picked={interests} setPicked={setInterests} search={findInterests} keyOf={(i) => i.id} nameOf={(i) => i.name} />
          </>
        ) : (
          <div className="grid gap-5 md:grid-cols-[1fr_17rem]">
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-medium text-muted">A day</p>
                <div className="grid grid-cols-4 gap-2">
                  {[info.minDaily, 20000, 30000, 50000].filter((v, i, a) => v >= info.minDaily && a.indexOf(v) === i).map((v) => (
                    <button key={v} type="button" onClick={() => setDaily(v)} className={`min-h-11 rounded-xl border text-sm font-semibold tnum ${daily === v ? "border-brand-500 bg-brand-25 text-brand-700 dark:bg-brand-500/10" : "border-border"}`}>
                      {(v / 1000).toLocaleString("en-UG")}k
                    </button>
                  ))}
                </div>
                <TextInput className="mt-2" type="number" min={info.minDaily} step={1000} value={daily} onChange={(e) => setDaily(Number(e.target.value))} aria-label="Budget a day (UGX)" />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted">For</p>
                <div className="grid grid-cols-4 gap-2">
                  {[3, 7, 14, 30].map((d) => (
                    <button key={d} type="button" onClick={() => setDays(d)} className={`min-h-11 rounded-xl border text-sm font-semibold ${days === d ? "border-brand-500 bg-brand-25 text-brand-700 dark:bg-brand-500/10" : "border-border"}`}>
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
              <dl className="space-y-1.5 rounded-2xl bg-background p-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Ad budget</dt>
                  <dd className="tnum">{ugx(price.budget)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Aming fee ({info.feePercent}%)</dt>
                  <dd className="tnum">{ugx(price.fee)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 font-bold">
                  <dt>From your Aming card</dt>
                  <dd className="tnum">{ugx(price.total)}</dd>
                </div>
                {info.balance !== null ? <p className={`pt-1 text-xs ${short ? "text-error-600" : "text-muted"}`}>On your card: {ugx(info.balance)}{short ? " — add money with MTN or Airtel first" : ""}</p> : null}
                <p className="pt-1 text-xs text-muted">What isn&apos;t spent comes back when it ends. No messages after a while: it stops by itself.</p>
              </dl>
            </div>
            <Preview pageName={info.pageName} photo={photo?.url ?? null} title={title} body={body} />
          </div>
        )}
      </StepForm>
    </FormSheet>
  );
}

/** How it shows in the Facebook / Instagram feed. */
function Preview({ pageName, photo, title, body }: { pageName: string | null; photo: string | null; title: string; body: string }) {
  return (
    <div className="h-fit overflow-hidden rounded-2xl border border-border bg-surface text-sm shadow-theme-sm">
      <div className="flex items-center gap-2 p-3">
        <span className="grid size-8 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">A</span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold">{pageName ?? "Aming"}</span>
          <span className="block text-[11px] text-muted">Sponsored</span>
        </span>
      </div>
      <p className="line-clamp-3 px-3 pb-2 text-xs">{body || "Your text"}</p>
      <div className="aspect-square bg-gray-100 dark:bg-white/5">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed link to the business's photo
          <img src={photo} alt="" className="size-full object-cover" />
        ) : null}
      </div>
      <div className="flex items-center gap-2 bg-background p-3">
        <span className="line-clamp-2 min-w-0 flex-1 text-xs font-semibold">{title || "Your headline"}</span>
        <span className="shrink-0 rounded-md bg-gray-200 px-2.5 py-1.5 text-[11px] font-semibold dark:bg-white/10">Learn more</span>
      </div>
    </div>
  );
}

/** Search Meta's towns or interests, and keep the picks as chips. */
function Picker<T>({
  label,
  placeholder,
  picked,
  setPicked,
  search,
  keyOf,
  nameOf,
}: {
  label: string;
  placeholder: string;
  picked: T[];
  setPicked: (v: T[]) => void;
  search: (q: string) => Promise<{ ok: true; data?: T[] } | { ok: false; error: string }>;
  keyOf: (t: T) => string;
  nameOf: (t: T) => string;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<T[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    timer.current = window.setTimeout(() => void search(q).then((r) => setFound(r.ok ? (r.data ?? []) : [])), 350);
    return () => window.clearTimeout(timer.current);
  }, [q, search]);
  const shown = q.trim().length < 2 ? [] : found;
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      {picked.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <button key={keyOf(p)} type="button" onClick={() => setPicked(picked.filter((x) => keyOf(x) !== keyOf(p)))} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {nameOf(p).split(",")[0]} <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      ) : null}
      <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={label} />
      {shown.length ? (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-surface">
          {shown.map((t) => (
            <li key={keyOf(t)}>
              <button
                type="button"
                onClick={() => {
                  if (!picked.some((p) => keyOf(p) === keyOf(t))) setPicked([...picked, t].slice(0, 10));
                  setQ("");
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5"
              >
                {nameOf(t)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
