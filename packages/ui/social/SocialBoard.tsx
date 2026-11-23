"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@repo/ui/Avatar";
import { Button, buttonClass } from "@repo/ui/Button";
import { DateTimeInput } from "@repo/ui/DateTimeInputs";
import { DeleteButton } from "@repo/ui/DeleteButton";
import { TextArea } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { ProgressBar } from "@repo/ui/ProgressBar";
import { StatusGlowBadge } from "@repo/ui/StatusGlowBadge";
import { Tabs } from "@repo/ui/Tabs";
import { deletePost, savePost, writeCaption } from "@repo/lib/social/actions";
import { platformName, platformOf, problemFor, STATUS_LABEL, type PostMedia, type PostMusic, type PostStatus, type SocialAccount, type SocialPost } from "@repo/lib/social/core";
import type { ProductionStatus } from "@repo/lib/types";

import { MediaPicker } from "./MediaPicker";
import { MusicPicker } from "./MusicPicker";
import { PlatformMark } from "./PlatformMark";

type List = "scheduled" | "posted" | "failed";

const KAMPALA = "Africa/Kampala";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: KAMPALA, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** "yyyy-mm-ddTHH:MM" in Kampala, as the picker uses it. */
const toPicker = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3_600_000).toISOString().slice(0, 16);
const fromPicker = (v: string) => (v ? new Date(`${v}:00+03:00`).toISOString() : null);
const listOf = (p: SocialPost): List => (p.status === "posted" || p.status === "partial" ? "posted" : p.status === "failed" ? "failed" : "scheduled");

/** Our statuses in the status badge's colours. */
const GLOW: Record<PostStatus, { status: ProductionStatus; late: boolean }> = {
  scheduled: { status: "quality_check", late: false },
  posting: { status: "in_production", late: false },
  posted: { status: "completed", late: false },
  partial: { status: "in_production", late: true },
  failed: { status: "in_production", late: true },
  paused: { status: "not_started", late: false },
};

/** Sent to a TikTok inbox to finish there ("In TikTok"): on Zernio it's posted, but the business still posts it in the app. */
const inTikTok = (a: SocialPost["accounts"][number]) => a.platform === "tiktok" && a.music?.kind === "app";

function Badge({ post: p }: { post: SocialPost }) {
  const waiting = p.status === "posted" && p.accounts.some(inTikTok);
  return <StatusGlowBadge status={waiting ? "quality_check" : GLOW[p.status].status} isDelayed={GLOW[p.status].late} label={waiting ? "Waiting in TikTok" : STATUS_LABEL[p.status]} />;
}

function Marks({ platforms }: { platforms: string[] }) {
  return (
    <span className="flex -space-x-1.5">
      {[...new Set(platforms)].map((p) => (
        <PlatformMark key={p} platform={p} size="xs" />
      ))}
    </span>
  );
}

// Social Media → Posts: image-led cards (2 a row on phones, up to 4 on a
// computer) in three lists; a card opens its details, New post the composer,
// both in a FormSheet.
export function SocialBoard({ accounts, posts, canEdit, limits }: { accounts: SocialAccount[]; posts: SocialPost[]; canEdit: boolean; limits: { postsAMonth: number; usedThisMonth: number } }) {
  const [list, setList] = useState<List>("scheduled");
  const [editing, setEditing] = useState<SocialPost | "new" | null>(null);
  const [viewing, setViewing] = useState<SocialPost | null>(null);
  const n = (k: List) => posts.filter((p) => listOf(p) === k).length;
  const shown = posts.filter((p) => listOf(p) === list);

  if (accounts.length === 0 && posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border px-6 py-12 text-center">
        <div className="flex -space-x-2">
          {["facebook", "instagram", "tiktok", "linkedin", "youtube"].map((p) => (
            <PlatformMark key={p} platform={p} size="lg" />
          ))}
        </div>
        <p className="text-lg font-semibold">Connect your pages to start</p>
        <Link href="/studio/social/pages" className={buttonClass("primary")}>
          Connect pages
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProgressBar value={limits.usedThisMonth} max={limits.postsAMonth} label="Posts this month" showValue="fraction" className="w-40" />
        {canEdit ? (
          <Button variant="primary" disabled={accounts.length === 0} onClick={() => setEditing("new")}>
            New post
          </Button>
        ) : null}
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
        <p className="py-10 text-center text-sm text-muted">Nothing here</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => (
            <li key={p.id}>
              <PostCard post={p} onOpen={() => setViewing(p)} />
            </li>
          ))}
        </ul>
      )}
      <FormSheet open={viewing !== null} onClose={() => setViewing(null)} title="Post">
        {viewing ? (
          <PostDetail
            post={viewing}
            canEdit={canEdit}
            onEdit={() => {
              setEditing(viewing);
              setViewing(null);
            }}
          />
        ) : null}
      </FormSheet>
      <FormSheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New post" : "Edit post"}>
        {editing ? <PostForm key={editing === "new" ? "new" : editing.id} post={editing === "new" ? null : editing} accounts={accounts} onDone={() => setEditing(null)} /> : null}
      </FormSheet>
    </div>
  );
}

function Cover({ media, className }: { media: PostMedia | undefined; className: string }) {
  if (!media) return null;
  return media.type === "video" ? (
    <video src={media.url} className={`${className} bg-black object-cover`} muted playsInline preload="metadata" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- the post's photo
    <img src={media.url} alt="" className={`${className} bg-gray-100 object-cover dark:bg-white/5`} />
  );
}

function PostCard({ post: p, onOpen }: { post: SocialPost; onOpen: () => void }) {
  const first = p.media[0];
  return (
    <button type="button" onClick={onOpen} className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-theme-xs transition hover:-translate-y-0.5 hover:shadow-theme-md">
      <div className="relative w-full">
        {first ? (
          <Cover media={first} className="aspect-[4/5] w-full" />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center bg-gradient-to-br from-brand-500 to-brand-700 p-4">
            <p className="line-clamp-6 text-sm font-semibold text-white">{p.caption}</p>
          </div>
        )}
        <span className="absolute left-2 top-2">
          <Marks platforms={p.accounts.map((a) => a.platform)} />
        </span>
        {p.media.length > 1 ? <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 text-xs font-semibold text-white">1/{p.media.length}</span> : null}
      </div>
      <div className="w-full space-y-1 p-3">
        <Badge post={p} />
        {first && p.caption ? <p className="line-clamp-2 text-sm">{p.caption}</p> : null}
        <p className="text-xs text-muted">{when(p.scheduled_at ?? p.created_at)}</p>
      </div>
    </button>
  );
}

function PostDetail({ post: p, canEdit, onEdit }: { post: SocialPost; canEdit: boolean; onEdit: () => void }) {
  const editable = p.status === "scheduled" || p.status === "paused" || p.status === "failed";
  return (
    <div className="space-y-4">
      {p.media.length ? (
        <div className="flex snap-x gap-2 overflow-x-auto">
          {p.media.map((m) => (
            <Cover key={m.url} media={m} className="aspect-[4/5] w-56 shrink-0 snap-start rounded-xl" />
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <Badge post={p} />
        <span className="text-xs text-muted">{when(p.scheduled_at ?? p.created_at)}</span>
      </div>
      {p.caption ? <p className="whitespace-pre-wrap text-sm">{p.caption}</p> : null}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {p.accounts.map((a) => {
          const r = p.results.find((x) => x.accountId === a.accountId);
          return (
            <li key={a.accountId} className="flex items-center gap-3 p-3">
              <PlatformMark platform={a.platform} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.name}</p>
                {r?.error ? <p className="text-xs text-error-600">{r.error}</p> : inTikTok(a) && p.status !== "scheduled" && p.status !== "paused" ? <p className="text-xs text-muted">Waiting in TikTok · open TikTok, add the song, post</p> : null}
              </div>
              {r?.url ? (
                <a href={r.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-600">
                  Open
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      {p.status === "paused" ? <p className="text-xs text-muted">Paused until Pro is back</p> : null}
      {p.error && !p.results.some((r) => r.error) ? <p className="text-xs text-error-600">{p.error}</p> : null}
      {canEdit ? (
        <div className="flex gap-2">
          {editable ? (
            <Button variant="primary" className="flex-1" onClick={onEdit}>
              {p.status === "scheduled" ? "Edit" : "Try again"}
            </Button>
          ) : null}
          <DeleteButton className="min-h-10" confirm={p.status === "scheduled" || p.status === "paused" ? "Delete this post? It won't go out." : "Remove it from this list? It stays on your pages."} action={() => deletePost(p.id)} />
        </div>
      ) : null}
    </div>
  );
}

function PostForm({ post: p, accounts, onDone }: { post: SocialPost | null; accounts: SocialAccount[]; onDone: () => void }) {
  const router = useRouter();
  const [caption, setCaption] = useState(p?.caption ?? "");
  const [media, setMedia] = useState<PostMedia[]>(p?.media ?? []);
  const [picked, setPicked] = useState<string[]>(p ? p.accounts.map((a) => a.accountId).filter((id) => accounts.some((a) => a.id === id)) : accounts.filter((a) => !a.broken).map((a) => a.id));
  // A paused or failed post keeps its time only if it's still ahead.
  const [later, setLater] = useState(() => !!p?.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now() + 60_000);
  const [at, setAt] = useState(() => (p?.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now() + 60_000 ? toPicker(p.scheduled_at) : ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [writing, startWriting] = useTransition();
  const [busy, setBusy] = useState(false);
  const [music, setMusic] = useState<PostMusic | null>(p?.accounts.find((a) => a.platform === "tiktok")?.music ?? null);

  const chosen = accounts.filter((a) => picked.includes(a.id));
  const tiktok = chosen.find((a) => a.platform === "tiktok");
  const problems = [...new Set(chosen.map((a) => problemFor(a.platform, caption, media)).filter((x): x is string => !!x))];
  const limit = chosen.map((a) => platformOf(a.platform)!.limit).sort((a, b) => a - b)[0];
  const over = limit !== undefined && caption.length > limit;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await savePost(p?.id ?? null, { caption, media, accountIds: picked, scheduledAt: later ? fromPicker(at) : null, music: tiktok ? music : null });
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex flex-wrap gap-3">
        {accounts.map((a) => {
          const on = picked.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              disabled={a.broken}
              aria-pressed={on}
              title={`${a.name} · ${platformName(a.platform)}`}
              onClick={() => setPicked(on ? picked.filter((x) => x !== a.id) : [...picked, a.id])}
              className={`relative rounded-full transition disabled:opacity-40 ${on ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-surface" : "opacity-40 grayscale hover:opacity-70"}`}
            >
              <Avatar name={a.name} src={a.picture ?? undefined} size="md" />
              <span className="absolute -bottom-1 -right-1">
                <PlatformMark platform={a.platform} size="xs" />
              </span>
            </button>
          );
        })}
      </div>
      <div className="relative">
        <TextArea value={caption} onChange={(e) => setCaption(e.target.value)} rows={7} maxLength={5000} placeholder="Write a caption, or a few words for Alexis" className="pb-10" />
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
          <button
            type="button"
            disabled={writing || !caption.trim()}
            onClick={() =>
              startWriting(async () => {
                setError(null);
                const res = await writeCaption(caption, chosen.map((a) => platformName(a.platform)));
                if (!res.ok) return setError(res.error);
                setCaption(res.data);
              })
            }
            className="inline-flex min-h-7 items-center gap-1 rounded-full bg-brand-50 px-3 text-xs font-semibold text-brand-700 disabled:opacity-50 dark:bg-brand-500/15 dark:text-brand-300"
          >
            ✦ {writing ? "Writing…" : "Alexis"}
          </button>
          {limit !== undefined ? <span className={`text-xs tnum ${over ? "font-semibold text-error-600" : "text-muted"}`}>{caption.length}/{limit}</span> : null}
        </div>
      </div>
      <MediaPicker value={media} onChange={setMedia} onBusy={setBusy} />
      {tiktok ? <MusicPicker accountId={tiktok.id} value={music} onChange={setMusic} photosOnly={!media.some((m) => m.type === "video")} /> : null}
      <div className="space-y-3">
        <div className="grid grid-cols-2 rounded-full bg-gray-100 p-1 dark:bg-white/5">
          {[
            { key: false, label: "Post now" },
            { key: true, label: "Schedule" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setLater(o.key)}
              className={`min-h-9 rounded-full text-sm font-medium transition ${later === o.key ? "bg-surface shadow-theme-xs" : "text-muted"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {later ? <DateTimeInput value={at} onChange={setAt} required /> : null}
      </div>
      {problems.length ? (
        <ul className="space-y-1 text-xs text-warning-700 dark:text-warning-400">
          {problems.map((x) => (
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
        {later ? (at ? `Schedule for ${when(fromPicker(at)!)}` : "Schedule") : `Post to ${picked.length} ${picked.length === 1 ? "page" : "pages"}`}
      </Button>
    </form>
  );
}
