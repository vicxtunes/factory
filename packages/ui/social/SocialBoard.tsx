"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { DateTimeInput } from "@repo/ui/DateTimeInputs";
import { DeleteButton } from "@repo/ui/DeleteButton";
import { Field, TextArea } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { Tabs } from "@repo/ui/Tabs";
import { connectPage, deletePost, disconnectPage, savePost, writeCaption } from "@repo/lib/social/actions";
import { platformName, platformOf, PLATFORMS, problemFor, STATUS_LABEL, type PostMedia, type SocialAccount, type SocialPost } from "@repo/lib/social/core";

import { MediaPicker } from "./MediaPicker";
import { PlatformMark } from "./PlatformMark";
import { SocialInbox } from "./SocialInbox";
import { SocialResults } from "./SocialResults";

type View = "posts" | "inbox" | "results";
type List = "scheduled" | "posted" | "failed";

const KAMPALA = "Africa/Kampala";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: KAMPALA, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** "yyyy-mm-ddTHH:MM" in Kampala, as the picker uses it. */
const toPicker = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3_600_000).toISOString().slice(0, 16);
const fromPicker = (v: string) => (v ? new Date(`${v}:00+03:00`).toISOString() : null);

const listOf = (p: SocialPost): List => (p.status === "posted" || p.status === "partial" ? "posted" : p.status === "failed" ? "failed" : "scheduled");

// My Business → Social posts (packages/lib/social): the pages connected, the
// posts in three lists (grid from sm up), new and edit in a FormSheet; Inbox
// and Results as tabs.
export function SocialBoard({
  accounts,
  posts,
  canEdit,
  limits,
  connectedNote,
}: {
  accounts: SocialAccount[];
  posts: SocialPost[];
  canEdit: boolean;
  limits: { pages: number; postsAMonth: number; usedThisMonth: number; xAllowed: boolean };
  /** What Zernio said on the way back from connecting. */
  connectedNote: { ok: boolean; text: string } | null;
}) {
  const [view, setView] = useState<View>("posts");
  const [list, setList] = useState<List>("scheduled");
  const [editing, setEditing] = useState<SocialPost | "new" | null>(null);
  const shown = posts.filter((p) => listOf(p) === list);
  const n = (k: List) => posts.filter((p) => listOf(p) === k).length;

  return (
    <div className="space-y-4">
      {connectedNote ? (
        <p className={`rounded-xl px-3 py-2 text-sm ${connectedNote.ok ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500" : "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400"}`}>
          {connectedNote.text}
        </p>
      ) : null}
      <Pages accounts={accounts} canEdit={canEdit} max={limits.pages} xAllowed={limits.xAllowed} />
      <Tabs
        label="Social posts"
        value={view}
        onChange={setView}
        tabs={[
          { key: "posts", label: "Posts" },
          { key: "inbox", label: "Inbox" },
          { key: "results", label: "Results" },
        ]}
      />
      {view === "inbox" ? <SocialInbox canReply={canEdit} /> : null}
      {view === "results" ? <SocialResults /> : null}
      {view === "posts" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {canEdit ? (
              <Button variant="primary" disabled={accounts.length === 0} onClick={() => setEditing("new")}>
                New post
              </Button>
            ) : (
              <span />
            )}
            <p className="text-xs text-muted">
              {limits.usedThisMonth} of {limits.postsAMonth} posts this month
            </p>
          </div>
          <Tabs
            label="Which posts"
            value={list}
            onChange={setList}
            tabs={[
              { key: "scheduled", label: "Scheduled", count: n("scheduled") },
              { key: "posted", label: "Posted", count: n("posted") },
              { key: "failed", label: "Failed", count: n("failed"), tone: "warning" },
            ]}
          />
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
              {accounts.length === 0 ? "Connect a page above, then make your first post." : "Nothing here yet."}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((p) => (
                <PostCard key={p.id} post={p} canEdit={canEdit} onEdit={() => setEditing(p)} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
      <FormSheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New post" : "Edit post"}>
        {editing ? <PostForm key={editing === "new" ? "new" : editing.id} post={editing === "new" ? null : editing} accounts={accounts} onDone={() => setEditing(null)} /> : null}
      </FormSheet>
    </div>
  );
}

function Pages({ accounts, canEdit, max, xAllowed }: { accounts: SocialAccount[]; canEdit: boolean; max: number; xAllowed: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const choices = PLATFORMS.filter((p) => p.id !== "twitter" || xAllowed);

  function connect(platform: string) {
    setError(null);
    start(async () => {
      const res = await connectPage(platform);
      if (!res.ok) return setError(res.error);
      window.location.href = res.data;
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-3 shadow-theme-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Your pages <span className="text-xs font-normal text-muted">({accounts.length} of {max})</span>
        </p>
        {canEdit && accounts.length < max ? (
          <Button variant="secondary" className="min-h-8 text-xs" onClick={() => setOpen(true)}>
            Connect a page
          </Button>
        ) : null}
      </div>
      {accounts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Connect your Facebook, Instagram, TikTok and other pages once. Then post to all of them from here, now or at a time you pick.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2 text-sm">
              {a.picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- the page's own picture, from the platform
                <img src={a.picture} alt="" className="size-6 rounded-full object-cover" />
              ) : (
                <PlatformMark platform={a.platform} className="size-6" />
              )}
              <PlatformMark platform={a.platform} className="size-4" />
              <span className="max-w-40 truncate">{a.name}</span>
              {a.broken ? (
                <button type="button" className="text-xs text-error-600" disabled={pending} onClick={() => connect(a.platform)}>
                  Reconnect
                </button>
              ) : null}
              {canEdit ? (
                <DeleteButton
                  label="Disconnect"
                  confirm={`Disconnect ${a.name}? Scheduled posts to it won't go.`}
                  className="min-h-7 px-2 text-xs"
                  action={() => disconnectPage(a.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-2 text-sm text-error-600">{error}</p> : null}
      <FormSheet open={open} onClose={() => setOpen(false)} title="Connect a page">
        <div className="space-y-3">
          <p className="text-sm text-muted">You sign in on the platform&apos;s own page and choose which page or account Aming may post to. Then you come back here.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {choices.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={pending}
                onClick={() => connect(p.id)}
                className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-background disabled:opacity-60"
              >
                <PlatformMark platform={p.id} />
                {p.name}
              </button>
            ))}
          </div>
          {pending ? <p className="text-sm text-muted">Opening…</p> : null}
          {error ? <p className="text-sm text-error-600">{error}</p> : null}
        </div>
      </FormSheet>
    </section>
  );
}

function PostCard({ post: p, canEdit, onEdit }: { post: SocialPost; canEdit: boolean; onEdit: () => void }) {
  const first = p.media[0];
  const tone =
    p.status === "posted"
      ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
      : p.status === "failed" || p.status === "partial"
        ? "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400"
        : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300";
  const editable = p.status === "scheduled" || p.status === "paused" || p.status === "failed";

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
      {first ? (
        first.type === "video" ? (
          <video src={first.url} className="aspect-square w-full bg-black object-cover" muted playsInline preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- the post's photo
          <img src={first.url} alt="" className="aspect-square w-full bg-gray-100 object-cover dark:bg-white/5" />
        )
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex -space-x-1">
            {p.accounts.map((a) => (
              <span key={a.accountId} title={a.name} className="rounded-full bg-surface p-0.5">
                <PlatformMark platform={a.platform} className="size-4" />
              </span>
            ))}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABEL[p.status]}</span>
        </div>
        {p.caption ? <p className="line-clamp-4 whitespace-pre-wrap text-sm">{p.caption}</p> : null}
        <p className="text-xs text-muted">
          {p.status === "paused"
            ? "Paused: Pro ended. It goes at its time once Pro is back, or pick a new time."
            : p.scheduled_at && p.status === "scheduled"
              ? `Goes ${when(p.scheduled_at)}`
              : `${p.scheduled_at ? when(p.scheduled_at) : when(p.created_at)} · by ${p.created_by_name}`}
        </p>
        {p.results.some((r) => r.url || r.error) ? (
          <ul className="space-y-1 text-xs">
            {p.results.map((r) => (
              <li key={r.accountId + r.platform} className="flex items-center gap-1.5">
                <PlatformMark platform={r.platform} className="size-3.5" />
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-brand-600">
                    See it on {platformName(r.platform)}
                  </a>
                ) : r.error ? (
                  <span className="text-error-600">{r.error}</span>
                ) : (
                  <span className="text-muted">{r.status}</span>
                )}
              </li>
            ))}
          </ul>
        ) : p.error ? (
          <p className="text-xs text-error-600">{p.error}</p>
        ) : null}
        {canEdit ? (
          <div className="mt-auto flex flex-wrap items-start gap-2 pt-1">
            {editable ? (
              <Button variant="secondary" className="min-h-8 text-xs" onClick={onEdit}>
                {p.status === "scheduled" ? "Edit" : "Try again"}
              </Button>
            ) : null}
            <DeleteButton
              confirm={p.status === "scheduled" || p.status === "paused" ? "Delete this post? It won't go out." : "Take this off your list? It stays on your pages."}
              action={() => deletePost(p.id)}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function PostForm({ post: p, accounts, onDone }: { post: SocialPost | null; accounts: SocialAccount[]; onDone: () => void }) {
  const router = useRouter();
  const [caption, setCaption] = useState(p?.caption ?? "");
  const [media, setMedia] = useState<PostMedia[]>(p?.media ?? []);
  const [picked, setPicked] = useState<string[]>(p ? p.accounts.map((a) => a.accountId).filter((id) => accounts.some((a) => a.id === id)) : accounts.filter((a) => !a.broken).map((a) => a.id));
  // A paused or failed post keeps its time only if it's still ahead (else a new one is picked).
  const [later, setLater] = useState(() => !!p?.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now() + 60_000);
  const [at, setAt] = useState(() => (p?.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now() + 60_000 ? toPicker(p.scheduled_at) : ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [writing, startWriting] = useTransition();

  const chosen = accounts.filter((a) => picked.includes(a.id));
  const problems = chosen.map((a) => problemFor(a.platform, caption, media)).filter((x): x is string => !!x);
  const shortest = chosen.map((a) => platformOf(a.platform)!).sort((a, b) => a.limit - b.limit)[0];

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await savePost(p?.id ?? null, { caption, media, accountIds: picked, scheduledAt: later ? fromPicker(at) : null });
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-medium text-muted">Post to</p>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const on = picked.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                disabled={a.broken}
                onClick={() => setPicked(on ? picked.filter((x) => x !== a.id) : [...picked, a.id])}
                className={`flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm disabled:opacity-50 ${on ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-border"}`}
                aria-pressed={on}
              >
                <PlatformMark platform={a.platform} className="size-4" />
                <span className="max-w-36 truncate">{a.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Caption" hint={shortest ? `${caption.length.toLocaleString("en-UG")} / ${shortest.limit.toLocaleString("en-UG")} (${shortest.name} is the shortest you picked)` : undefined}>
        <TextArea value={caption} onChange={(e) => setCaption(e.target.value)} rows={6} maxLength={5000} placeholder="What's new? Or a few words about it, then Write with Alexis." />
      </Field>
      <Button
        type="button"
        variant="secondary"
        className="min-h-8 text-xs"
        loading={writing}
        disabled={writing || !caption.trim()}
        onClick={() =>
          startWriting(async () => {
            setError(null);
            const res = await writeCaption(caption, chosen.map((a) => platformName(a.platform)));
            if (!res.ok) return setError(res.error);
            setCaption(res.data);
          })
        }
      >
        Write with Alexis
      </Button>
      <MediaPicker value={media} onChange={setMedia} onBusy={setBusy} />
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button type="button" variant={later ? "secondary" : "primary"} className="flex-1" onClick={() => setLater(false)}>
            Post now
          </Button>
          <Button type="button" variant={later ? "primary" : "secondary"} className="flex-1" onClick={() => setLater(true)}>
            Schedule
          </Button>
        </div>
        {later ? (
          <Field label="When (Kampala time)">
            <DateTimeInput value={at} onChange={setAt} required />
          </Field>
        ) : null}
      </div>
      {problems.length ? (
        <ul className="space-y-1 text-sm text-warning-700 dark:text-warning-400">
          {[...new Set(problems)].map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={pending}
        disabled={pending || busy || picked.length === 0 || problems.length > 0 || (!caption.trim() && media.length === 0) || (later && !at)}
      >
        {later ? "Schedule" : "Post now"}
      </Button>
    </form>
  );
}
