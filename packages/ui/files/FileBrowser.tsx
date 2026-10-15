"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition, type DragEvent } from "react";

import { Button } from "@repo/ui/Button";
import { BatchRename } from "@repo/ui/files/BatchRename";
import { ContextMenu, type ContextEntry } from "@repo/ui/files/ContextMenu";
import { FileViewer } from "@repo/ui/files/FileViewer";
import { FolderArt } from "@repo/ui/files/FolderArt";
import { ShareDialog, type SharePeople } from "@repo/ui/files/ShareDialog";
import { uploadServiceMedia } from "@repo/ui/files/media-upload";
import { putSigned } from "@repo/ui/photos/browser";
import {
  confirmFileUpload,
  createFolder,
  deleteFile,
  finishTask,
  pickFile,
  deleteFolder,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
  renameMany,
  startFileUpload,
} from "@repo/lib/files/actions";
import { deletePhoto, removeServiceVideo, setAlbumCover } from "@repo/lib/photos/actions";
import {
  isLocked,
  isWithin,
  MAX_FILE_BYTES,
  MAX_FILES_PER_BATCH,
  pathTo,
  uniqueName,
  type FileView,
  type Folder,
  type FolderListing,
  type FolderShare,
  type Via,
} from "@repo/lib/files/core";
import { formatBytes } from "@repo/lib/photos/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

type Entry = { kind: "folder"; id: string; name: string; folder: Folder } | { kind: "file"; id: string; name: string; file: FileView };
type Upload = { name: string; state: "waiting" | "uploading" | "done" | "failed"; progress: number; error?: string };
type View = "grid" | "list";

/** A task being done in this folder: choosing photos (picks) or giving feedback (comments). */
export interface FolderTask {
  id: string;
  title: string;
  kind: "todo" | "choose" | "feedback";
  pickMin: number | null;
  pickMax: number | null;
  dueOn: string | null;
  done: boolean;
  /** Files picked so far. */
  picks: string[];
  /** Theirs to do: they pick and finish; anyone else (the business) sees how it's going. */
  mine: boolean;
  /** Who it's for, for the business's view ("Nakato's choice"). */
  forName: string | null;
}
/** A name being typed in place: an item's new name, or a new folder's. */
type Naming = { key: string; value: string };

/** The top's value in the "Move to" list, and where a drag onto "Files" goes. */
const TOP = "";
const NEW = "new-folder";
const VIEW_KEY = "files-view";
/** What an item dragged inside the browser carries (not "Files", so it never looks like an upload). */
const DRAG_TYPE = "application/x-aming-item";
/** Pictures up to this size show themselves; bigger ones show their type. */
const PREVIEW_BYTES = 5 * 1024 * 1024;
const LONG_PRESS_MS = 500;

const keyOf = (e: Pick<Entry, "kind" | "id">) => `${e.kind}-${e.id}`;
const isLockedEntry = (e: Entry) => e.kind === "folder" && isLocked(e.folder);

/** A file's type as a short label on a colour, from its extension, else its content type. */
const KINDS: { label: string; tone: string; extensions: string[]; type?: string }[] = [
  { label: "PDF", tone: "bg-red-500", extensions: ["pdf"] },
  { label: "IMG", tone: "bg-emerald-500", extensions: ["jpg", "jpeg", "png", "gif", "webp", "svg", "heic", "avif"], type: "image/" },
  { label: "VID", tone: "bg-violet-500", extensions: ["mp4", "mov", "avi", "mkv", "webm"], type: "video/" },
  { label: "AUD", tone: "bg-pink-500", extensions: ["mp3", "wav", "m4a", "aac", "flac"], type: "audio/" },
  { label: "ZIP", tone: "bg-slate-500", extensions: ["zip", "rar", "7z", "tar", "gz"] },
  { label: "XLS", tone: "bg-green-600", extensions: ["xls", "xlsx", "csv", "numbers"] },
  { label: "PPT", tone: "bg-orange-500", extensions: ["ppt", "pptx", "key"] },
  { label: "DOC", tone: "bg-blue-500", extensions: ["doc", "docx", "txt", "rtf", "pages", "odt"] },
  { label: "PSD", tone: "bg-sky-600", extensions: ["psd", "ai", "fig", "sketch", "xd", "indd", "eps"] },
];

function kindOf(file: Pick<FileView, "name" | "contentType">) {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  return (
    KINDS.find((k) => k.extensions.includes(ext)) ??
    KINDS.find((k) => k.type && file.contentType.startsWith(k.type)) ?? { label: ext.slice(0, 4).toUpperCase() || "FILE", tone: "bg-gray-400" }
  );
}

function typeName(entry: Entry): string {
  if (entry.kind === "file") return `${kindOf(entry.file).label} file`;
  return entry.folder.holdsProjects ? "Every project" : entry.folder.projectId ? "Project folder" : "File folder";
}

function KindBadge({ file, large }: { file: FileView; large: boolean }) {
  const kind = kindOf(file);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-wide text-white shadow-sm ${kind.tone} ${large ? "h-14 w-11 text-[11px]" : "h-6 w-5 text-[7px]"}`}
      aria-hidden
    >
      {kind.label}
    </span>
  );
}

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ICONS = {
  search: "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z",
  grid: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  list: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z",
  folderPlus: "M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z",
  upload: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5",
  chevron: "m8.25 4.5 7.5 7.5-7.5 7.5",
  people:
    "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  star: "M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z",
  lock: "M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z",
};

/** An item's picture: the folder (with a lock when the database keeps it), a picture's preview, or the file's type. */
function Glyph({ entry: e, large, shared = false }: { entry: Entry; large: boolean; shared?: boolean }) {
  return (
    <span className="relative inline-flex">
      <Picture entry={e} large={large} shared={shared} />
      {e.kind === "file" && e.file.openComments ? (
        <span
          title={`${e.file.openComments} open comment${e.file.openComments === 1 ? "" : "s"}`}
          className={`absolute -top-1.5 -right-1.5 rounded-full bg-brand-500 font-semibold text-white shadow-sm ${large ? "px-1.5 text-[10px]" : "px-1 text-[8px]"}`}
        >
          {e.file.openComments}
        </span>
      ) : null}
    </span>
  );
}

function Picture({ entry: e, large, shared }: { entry: Entry; large: boolean; shared: boolean }) {
  const corner = (d: string, side: string, label: string) => (
    <span title={label} className={`absolute -bottom-1 ${side} rounded-full bg-surface text-muted shadow-sm ${large ? "p-1" : "p-px"}`}>
      <Icon d={d} className={large ? "h-3 w-3" : "h-2 w-2"} />
    </span>
  );
  if (e.kind === "folder") {
    return (
      <span className="relative inline-flex">
        <FolderArt className={large ? "h-14 w-[4.5rem]" : "h-5 w-6"} />
        {isLocked(e.folder) ? corner(ICONS.lock, "-right-1", "Kept with its project") : null}
        {shared ? corner(ICONS.people, "-left-1", "Shared") : null}
      </span>
    );
  }
  // A service's photos are already resized for the web, so they always show.
  if (e.file.previewUrl && e.file.contentType.startsWith("image/") && (e.file.bytes <= PREVIEW_BYTES || e.file.media)) {
    return (
      <span className="relative inline-flex">
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived storage link */}
        <img src={e.file.previewUrl} alt="" loading="lazy" draggable={false} className={`rounded-md object-cover shadow-sm ${large ? "h-14 w-16" : "h-5 w-6"}`} />
        {e.file.media?.kind === "photo" && e.file.media.cover ? corner(ICONS.star, "-right-1", "The cover") : null}
      </span>
    );
  }
  return <KindBadge file={e.file} large={large} />;
}

// The tiles / details choice, kept per browser (and followed across its tabs).
const viewListeners = new Set<() => void>();

function subscribeView(onChange: () => void): () => void {
  viewListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    viewListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function chooseView(view: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage blocked (private mode etc.): the choice just isn't remembered.
  }
  viewListeners.forEach((l) => l());
}

/** Runs `work` over `items`, `limit` at a time. */
async function pool<T>(items: T[], limit: number, work: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await work(items[i], i);
      }
    }),
  );
}

/**
 * A name typed in place, as in Windows: the part before a file's extension
 * starts selected; Enter or leaving saves, Escape cancels. After a refused
 * name it stays open to fix.
 */
function NameInput({
  value,
  file,
  onChange,
  onDone,
  onCancel,
  className,
}: {
  value: string;
  file: boolean;
  onChange: (v: string) => void;
  onDone: () => void;
  onCancel: () => void;
  className: string;
}) {
  // Enter, then the blur that follows, saves once.
  const saved = useRef(false);
  const save = () => {
    if (saved.current) return;
    saved.current = true;
    onDone();
  };
  return (
    <input
      aria-label="Name"
      value={value}
      maxLength={file ? 200 : 120}
      autoFocus
      onFocus={(e) => {
        const dot = file ? e.target.value.lastIndexOf(".") : -1;
        e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
      }}
      onChange={(e) => {
        saved.current = false;
        onChange(e.target.value);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") save();
        if (e.key === "Escape") onCancel();
      }}
      onBlur={save}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`rounded border border-brand-500 bg-surface px-1 outline-none ring-2 ring-brand-500/30 ${className}`}
    />
  );
}

/**
 * One folder of a business's files, worked like a desktop's: folders and
 * files as icons (or details), click to select, double-click (or tap) to
 * open, right-click (or long-press) for Open / Rename / Move / Delete, names
 * edited in place, F2 and Delete keys, items dragged onto a folder to move
 * them, files dropped anywhere to upload (straight to storage, then checked
 * by the server against the allowance). The Projects folder and project
 * folders are kept by the database, so they only open.
 */
export function FileBrowser({
  listing,
  basePath,
  scope,
  via,
  topLabel = "Files",
  sharing,
  task,
}: {
  listing: FolderListing;
  basePath: string;
  scope: Pick<TenantScope, "locale" | "timeZone">;
  /** Where this browser is (the studio, a client's page, a link): the server works out the rights from it. */
  via: Via;
  /** What the top is called: "Files" in the studio, "Shared with you" for someone with shares. */
  topLabel?: string;
  /** For whoever has everything: the studio's shares and who folders can be shared with. */
  sharing?: { shares: FolderShare[]; people: SharePeople; linkBase: string | null };
  /** A task being done here (?task=): picks and Send, or comments and Done. */
  task?: FolderTask;
}) {
  const router = useRouter();
  const here = listing.folder?.id ?? null;
  const rights = listing.rights;
  const view = useSyncExternalStore(subscribeView, readView, () => "grid" as const);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** On a phone: taps pick items instead of opening them (from "Select" in the long-press menu). */
  const [selecting, setSelecting] = useState(false);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [renaming, setRenaming] = useState<Entry[] | null>(null);
  const [moving, setMoving] = useState<{ entries: Entry[]; value: string } | null>(null);
  const [picks, setPicks] = useState<ReadonlySet<string>>(() => new Set(task?.picks ?? []));
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [copied, setCopied] = useState(false);
  /** The file open in the viewer: its place among the files shown. */
  const [viewing, setViewing] = useState<number | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [sharingFolder, setSharingFolder] = useState<Folder | null>(null);
  /** The right-click menu, and whether a long press opened it (it then offers Select). */
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry | null; touch?: boolean } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pickRef = useRef<HTMLInputElement>(null);
  const dragged = useRef<Entry[] | null>(null);
  const press = useRef<{ touch: boolean; long: boolean; at: number; timer?: ReturnType<typeof setTimeout> }>({ touch: false, long: false, at: 0 });
  /** Where a Shift-click range starts: the last item clicked. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);

  const href = (folderId: string | null) => (folderId ? `${basePath}?folder=${folderId}` : basePath);

  function run(work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  }

  const match = (name: string) => name.toLowerCase().includes(query.trim().toLowerCase());
  const entries: Entry[] = [
    ...(onlyPicked ? [] : listing.folders.filter((f) => match(f.name)).map((f): Entry => ({ kind: "folder", id: f.id, name: f.name, folder: f }))),
    ...listing.files.filter((f) => match(f.name) && (!onlyPicked || picks.has(f.id))).map((f): Entry => ({ kind: "file", id: f.id, name: f.name, file: f })),
  ];

  // ── A task here: choosing (♥ on each photo) or feedback (comments), then Send / Done.
  const choosing = task?.kind === "choose";
  const canPick = choosing && task.mine && !task.done;
  function togglePick(fileId: string) {
    if (!task || !canPick) return;
    const next = !picks.has(fileId);
    const flip = (s: ReadonlySet<string>) => {
      const n = new Set(s);
      if (next) n.add(fileId);
      else n.delete(fileId);
      return n;
    };
    setPicks(flip);
    setError(null);
    pickFile(via, task.id, fileId, next).then((res) => {
      if (res.ok) return;
      // Put it back as it was.
      setPicks((s) => {
        const n = new Set(s);
        if (next) n.delete(fileId);
        else n.add(fileId);
        return n;
      });
      setError(res.error);
    });
  }
  async function copyForLightroom() {
    // Names without extensions, commas between: Lightroom's text filter finds any of them.
    const names = listing.files.filter((f) => picks.has(f.id)).map((f) => (f.name.lastIndexOf(".") > 0 ? f.name.slice(0, f.name.lastIndexOf(".")) : f.name));
    try {
      await navigator.clipboard.writeText(names.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy the names.");
    }
  }
  const heart = (fileId: string, className: string) =>
    choosing && (canPick || picks.has(fileId)) ? (
      <button
        type="button"
        aria-pressed={picks.has(fileId)}
        aria-label={picks.has(fileId) ? "Chosen: tap to unchoose" : "Choose this one"}
        disabled={!canPick}
        onClick={(ev) => {
          ev.stopPropagation();
          togglePick(fileId);
        }}
        className={`z-10 flex h-7 w-7 items-center justify-center rounded-full text-base shadow-sm transition ${
          picks.has(fileId) ? "bg-brand-500 text-white" : "bg-surface/90 text-muted hover:text-brand-500"
        } ${canPick ? "" : "cursor-default"} ${className}`}
      >
        {picks.has(fileId) ? "♥" : "♡"}
      </button>
    ) : null;

  // ── Selecting: click one, Ctrl/⌘-click adds, Shift-click a range, a box drawn over the space, Ctrl/⌘+A all.
  const chosen = entries.filter((e) => selected.has(keyOf(e)));
  function selectOnly(key: string) {
    setSelected(new Set([key]));
    setAnchor(key);
  }
  function clearSelection() {
    setSelected(new Set());
    setSelecting(false);
  }
  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });
    setAnchor(key);
  }
  function selectRange(key: string) {
    const keys = entries.map(keyOf);
    const from = keys.indexOf(anchor ?? key);
    const to = keys.indexOf(key);
    if (from < 0) return selectOnly(key);
    setSelected(new Set(keys.slice(Math.min(from, to), Math.max(from, to) + 1)));
  }
  /** The items an action on `e` is for: everything selected when `e` is among several, else just `e`. */
  const actOn = (e: Entry) => (selected.has(keyOf(e)) && chosen.length > 1 ? chosen : [e]);

  /** Draws a selection box from a press on the empty space; the items it touches are selected (added to, with Ctrl/⌘). */
  function startBox(ev: React.PointerEvent) {
    if (ev.pointerType !== "mouse" || ev.button !== 0) return;
    const keep = ev.ctrlKey || ev.metaKey ? new Set(selected) : new Set<string>();
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    let moved = false;
    const onMove = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 4) return;
      moved = true;
      const rect = { left: Math.min(x0, m.clientX), right: Math.max(x0, m.clientX), top: Math.min(y0, m.clientY), bottom: Math.max(y0, m.clientY) };
      setBox({ x0, y0, x1: m.clientX, y1: m.clientY });
      const hit = new Set(keep);
      area.current?.querySelectorAll<HTMLElement>("[data-item]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top) hit.add(el.dataset.item!);
      });
      setSelected(hit);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setBox(null);
      if (!moved) setSelected(keep);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const shownFiles = entries.flatMap((e) => (e.kind === "file" ? [e.file] : []));
  function open(e: Entry) {
    if (e.kind === "folder") router.push(href(e.id));
    else setViewing(shownFiles.findIndex((f) => f.id === e.id));
  }
  const download = (e: Entry) => e.kind === "file" && e.file.downloadUrl && window.location.assign(e.file.downloadUrl);

  const sharedFolders = new Set(sharing?.shares.map((s) => s.folderId));
  /** Whether the person may rename, move or delete `e`. */
  const changeable = (e: Entry) => rights.change && !isLockedEntry(e);

  function rename(e: Entry) {
    const many = actOn(e);
    if (!many.every(changeable)) return;
    if (many.length > 1) return setRenaming(many);
    selectOnly(keyOf(e));
    setNaming({ key: keyOf(e), value: e.name });
  }

  /** A service's or product's folder takes photos and a video, not folders. */
  const mediaFolder = listing.folder?.business?.kind === "item" ? listing.folder.business : null;
  const canNewFolder = rights.add && !mediaFolder;
  const shareable = (f: Folder) => sharing !== undefined && f.business === undefined;

  function newFolder() {
    if (!canNewFolder) return;
    setQuery("");
    clearSelection();
    setNaming({ key: NEW, value: uniqueName("New folder", listing.folders.map((f) => f.name)) });
  }

  function saveName() {
    if (!naming) return;
    const value = naming.value.trim();
    if (naming.key === NEW) {
      if (!value) return setNaming(null);
      return run(() => createFolder(via, { parentId: here, name: value }), () => setNaming(null));
    }
    const e = entries.find((x) => keyOf(x) === naming.key);
    if (!e || !value || value === e.name) return setNaming(null);
    run(() => (e.kind === "folder" ? renameFolder(via, e.id, value) : renameFile(via, e.id, value)), () => setNaming(null));
  }

  /** Deletes one of a service's photos, or its preview video. */
  function removeMedia(e: Entry) {
    if (e.kind !== "file" || !e.file.media) return;
    const media = e.file.media;
    if (!window.confirm(media.kind === "video" ? "Remove the preview video?" : `Delete "${e.name}" from ${listing.folder?.name ?? "this service"}? This can't be undone.`)) return;
    run(() => (media.kind === "video" ? removeServiceVideo(media.albumId) : deletePhoto(e.id)), clearSelection);
  }

  function remove(e: Entry) {
    if (e.kind === "file" && e.file.media) return removeMedia(e);
    const many = actOn(e);
    if (!many.every(changeable)) return;
    const folders = many.filter((x) => x.kind === "folder").length;
    const question =
      many.length > 1
        ? `Delete these ${many.length} items${folders ? `, with everything in the ${folders === 1 ? "folder" : `${folders} folders`}` : ""}? This can't be undone.`
        : e.kind === "folder"
          ? `Delete the folder "${e.name}" and everything in it? This can't be undone.`
          : `Delete "${e.name}"? This can't be undone.`;
    if (!window.confirm(question)) return;
    run(() => each(many, (x) => (x.kind === "folder" ? deleteFolder(via, x.id) : deleteFile(via, x.id))), clearSelection);
  }

  /** Runs one action per item in turn, stopping at the first problem. */
  async function each(items: Entry[], work: (e: Entry) => Promise<{ ok: boolean; error?: string }>) {
    for (const item of items) {
      const res = await work(item);
      if (!res.ok) return { ok: false, error: `${item.name}: ${res.error ?? "Something went wrong."}` };
    }
    return { ok: true };
  }

  /** Whether `e` can go into folder `to` (null: the top): somewhere the person may add, not where it is, and a folder never into itself. */
  function canMove(e: Entry, to: string | null) {
    if (!changeable(e) || to === here) return false;
    if (!(to === null ? listing.addable.top : listing.addable.folders.includes(to))) return false;
    return !(e.kind === "folder" && to && isWithin(listing.allFolders, to, e.id));
  }

  function move(items: Entry[], to: string | null) {
    run(
      () => each(items, (e) => (e.kind === "folder" ? moveFolder(via, e.id, to) : moveFile(via, e.id, to))),
      () => {
        setMoving(null);
        clearSelection();
      },
    );
  }

  /** Where all of `items` can go, for "Move to…": the top and every folder they can all go in. */
  function destinations(items: Entry[]): { value: string; label: string }[] {
    const fits = (to: string | null) => items.every((e) => canMove(e, to));
    return [
      ...(fits(null) ? [{ value: TOP, label: `${topLabel} (top)` }] : []),
      ...listing.allFolders.filter((f) => fits(f.id)).map((f) => ({ value: f.id, label: pathTo(listing.allFolders, f.id).map((p) => p.name).join(" / ") })),
    ];
  }

  /** Several selected: the same actions, for all of them. */
  function manyMenu(items: Entry[]): ContextEntry[] {
    const all = items.every(changeable);
    const places = all ? destinations(items) : [];
    return [
      { note: `${items.length} selected` },
      ...(all
        ? ([
            { label: `Rename ${items.length} items…`, onSelect: () => setRenaming(items) },
            ...(places.length ? [{ label: `Move ${items.length} items to…`, onSelect: () => setMoving({ entries: items, value: places[0].value }) }] : []),
            "-",
            { label: `Delete ${items.length} items`, danger: true, onSelect: () => remove(items[0]) },
          ] satisfies ContextEntry[])
        : [{ note: rights.change ? "Some of these stay as they are (project or Business folders)." : "Shared with you to look at." } satisfies ContextEntry]),
      "-",
      { label: "Clear selection", onSelect: clearSelection },
    ];
  }

  function itemMenu(e: Entry, touch: boolean): ContextEntry[] {
    if (actOn(e).length > 1) return manyMenu(chosen);
    // On a phone, pressing and holding is also how picking several starts.
    const select: ContextEntry[] = touch ? [{ label: "Select", onSelect: () => (setSelecting(true), selectOnly(keyOf(e))) }] : [];
    const opener: ContextEntry[] =
      e.kind === "folder"
        ? [{ label: "Open", onSelect: () => open(e) }]
        : [
            { label: e.file.media ? "Open" : "Open and comment", onSelect: () => open(e) },
            ...(e.file.downloadUrl ? [{ label: "Download", onSelect: () => download(e) }] : [{ note: "Shared with you to look at, without downloads." }]),
          ];
    const share: ContextEntry[] = e.kind === "folder" && shareable(e.folder) ? [{ label: sharedFolders.has(e.id) ? "Sharing…" : "Share…", onSelect: () => setSharingFolder(e.folder) }] : [];
    if (e.kind === "file" && e.file.media) {
      const media = e.file.media;
      return [
        ...opener,
        ...(media.kind === "photo" && !media.cover ? [{ label: "Make cover", onSelect: () => run(() => setAlbumCover(media.albumId, e.id)) }] : []),
        "-",
        { label: media.kind === "video" ? "Remove video" : "Delete", danger: true, onSelect: () => removeMedia(e) },
      ];
    }
    if (isLockedEntry(e)) {
      const business = e.kind === "folder" ? e.folder.business : undefined;
      const note = business
        ? business.kind === "item"
          ? "Named after it: rename it on Packages & Services or Products."
          : "Follows what your business sells: add and rename on Packages & Services or Products."
        : e.kind === "folder" && e.folder.holdsProjects
          ? "Holds a folder for every project. It stays as it is."
          : "Made with its project and named after it. Rename the project to rename it.";
      return [...opener, ...select, ...share, "-", { note }];
    }
    if (!rights.change) return [...opener, ...select, ...share];
    const places = destinations([e]);
    return [
      ...opener,
      ...select,
      ...share,
      "-",
      { label: "Rename", onSelect: () => rename(e) },
      ...(places.length ? [{ label: "Move to…", onSelect: () => setMoving({ entries: [e], value: places[0].value }) }] : []),
      "-",
      { label: "Delete", danger: true, onSelect: () => remove(e) },
    ];
  }

  const backgroundMenu: ContextEntry[] = [
    ...(canNewFolder ? [{ label: "New folder", onSelect: newFolder }] : []),
    ...(rights.add ? ([{ label: mediaFolder ? "Add photos or a video" : "Upload files", onSelect: () => pickRef.current?.click() }, "-"] satisfies ContextEntry[]) : []),
    ...(entries.length ? ([{ label: "Select all", onSelect: () => setSelected(new Set(entries.map(keyOf))) }, "-"] satisfies ContextEntry[]) : []),
    { label: "Tiles", checked: view === "grid", onSelect: () => chooseView("grid") },
    { label: "Details", checked: view === "list", onSelect: () => chooseView("list") },
  ];

  /** Lets items dragged inside the browser drop on a folder (null: the top) to move there. */
  function dropProps(target: string | null) {
    const mark = target ?? TOP;
    return {
      onDragOver: (ev: DragEvent) => {
        const items = dragged.current;
        if (!items || !ev.dataTransfer.types.includes(DRAG_TYPE) || !items.every((e) => canMove(e, target))) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        setDropOn(mark);
      },
      onDragLeave: () => setDropOn((d) => (d === mark ? null : d)),
      onDrop: (ev: DragEvent) => {
        const items = dragged.current;
        if (!items || !ev.dataTransfer.types.includes(DRAG_TYPE)) return;
        ev.preventDefault();
        ev.stopPropagation();
        setDropOn(null);
        if (items.every((e) => canMove(e, target))) move(items, target);
      },
    };
  }

  /** Mouse: click selects (Ctrl/⌘ adds, Shift a range), double-click opens. Touch: tap opens (or picks, while selecting), a long press opens the menu. Keys: Enter, F2, Delete, the menu key. */
  function itemProps(e: Entry) {
    const key = keyOf(e);
    const showMenu = (x: number, y: number) => {
      if (!selected.has(key)) selectOnly(key);
      setMenu({ x, y, entry: e, touch: press.current.touch });
    };
    return {
      "data-item": key,
      draggable: changeable(e),
      title: e.kind === "file" ? [e.name, formatBytes(e.file.bytes), e.file.createdAt ? formatDay(scope, e.file.createdAt) : null].filter(Boolean).join(" · ") : e.name,
      onPointerDown: (ev: React.PointerEvent) => {
        clearTimeout(press.current.timer);
        press.current = { touch: ev.pointerType === "touch", long: false, at: Date.now() };
        if (ev.pointerType === "touch") {
          const { clientX, clientY } = ev;
          press.current.timer = setTimeout(() => {
            press.current.long = true;
            showMenu(clientX, clientY);
          }, LONG_PRESS_MS);
        }
      },
      onPointerUp: () => clearTimeout(press.current.timer),
      onPointerCancel: () => clearTimeout(press.current.timer),
      onPointerLeave: () => clearTimeout(press.current.timer),
      onClick: (ev: React.MouseEvent) => {
        if (press.current.long) return;
        if (press.current.touch) return selecting ? toggle(key) : open(e);
        if (ev.ctrlKey || ev.metaKey) toggle(key);
        else if (ev.shiftKey) selectRange(key);
        else selectOnly(key);
      },
      onDoubleClick: () => open(e),
      onContextMenu: (ev: React.MouseEvent) => {
        ev.preventDefault();
        clearTimeout(press.current.timer);
        // A long press can fire this as well as the timer: the tap that ends it mustn't open the item.
        if (press.current.touch) press.current.long = true;
        showMenu(ev.clientX, ev.clientY);
      },
      onKeyDown: (ev: React.KeyboardEvent<HTMLElement>) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          open(e);
        } else if (ev.key === "F2") {
          ev.preventDefault();
          rename(e);
        } else if (ev.key === "Delete") remove(e);
        else if (ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey)) {
          ev.preventDefault();
          const r = ev.currentTarget.getBoundingClientRect();
          showMenu(r.left + r.width / 2, r.top + r.height / 2);
        }
      },
      // Tabbing to an item selects it (a click selects on its own, with its keys).
      onFocus: () => {
        if (Date.now() - press.current.at > 500 && !selected.has(key)) selectOnly(key);
      },
      onDragStart: (ev: DragEvent) => {
        dragged.current = actOn(e).filter(changeable);
        ev.dataTransfer.setData(DRAG_TYPE, key);
        ev.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => {
        dragged.current = null;
        setDropOn(null);
      },
      ...(e.kind === "folder" ? dropProps(e.id) : {}),
    };
  }

  /** The look of an item: hovered, selected, or a folder something is dragged over. */
  function stateClass(e: Entry) {
    if (e.kind === "folder" && dropOn === e.id) return "bg-brand-100 ring-2 ring-brand-400 dark:bg-brand-500/25";
    if (selected.has(keyOf(e))) return "bg-brand-100/80 ring-1 ring-brand-300 dark:bg-brand-500/20 dark:ring-brand-500/40";
    return "hover:bg-brand-50 dark:hover:bg-white/5";
  }

  async function upload(chosen: File[]) {
    setError(null);
    if (mediaFolder) return uploadMedia(chosen, mediaFolder.serviceId, mediaFolder.albumId);
    const tooBig = chosen.filter((f) => f.size > MAX_FILE_BYTES);
    const files = chosen.filter((f) => f.size <= MAX_FILE_BYTES);
    if (tooBig.length) setError(`${tooBig.map((f) => f.name).join(", ")}: too big. A file can be up to ${formatBytes(MAX_FILE_BYTES)}.`);
    if (!files.length) return;
    setUploading(true);
    setUploads(files.map((f) => ({ name: f.name, state: "waiting", progress: 0 })));
    const update = (i: number, patch: Partial<Upload>) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    for (let from = 0; from < files.length; from += MAX_FILES_PER_BATCH) {
      const batch = files.slice(from, from + MAX_FILES_PER_BATCH);
      const res = await startFileUpload(via, { folderId: here, files: batch.map((f) => ({ name: f.name, bytes: f.size, contentType: f.type })) });
      if (!res.ok) {
        setError(res.error);
        batch.forEach((_, k) => update(from + k, { state: "failed", error: "Not uploaded." }));
        break;
      }
      await pool(batch, 3, async (file, k) => {
        const at = from + k;
        update(at, { state: "uploading" });
        try {
          const ticket = res.data[k];
          await putSigned(ticket.url, file, (progress) => update(at, { progress }), ticket.contentType);
          const done = await confirmFileUpload(via, { folderId: here, fileId: ticket.fileId, name: file.name, contentType: ticket.contentType });
          update(at, done.ok ? { state: "done", progress: 1 } : { state: "failed", error: done.error });
        } catch (err) {
          update(at, { state: "failed", error: err instanceof Error ? err.message : "Upload failed." });
        }
      });
      router.refresh();
    }
    setUploading(false);
  }

  async function uploadMedia(chosen: File[], serviceId: string, albumId: string | null) {
    setUploading(true);
    setUploads(chosen.map((f) => ({ name: f.name, state: "waiting", progress: 0 })));
    const problem = await uploadServiceMedia(serviceId, albumId, chosen, (i, patch) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, ...patch } : x))));
    if (problem) setError(problem);
    router.refresh();
    setUploading(false);
  }

  const nameInput = (file: boolean, className: string) => (
    <NameInput
      value={naming!.value}
      file={file}
      onChange={(value) => setNaming((n) => (n ? { ...n, value } : n))}
      onDone={saveName}
      onCancel={() => setNaming(null)}
      className={className}
    />
  );
  const newFolderShown = naming?.key === NEW;
  const empty = entries.length === 0 && !newFolderShown;
  const editingTile = "flex flex-col items-center gap-1.5 rounded-xl bg-brand-100/80 p-2 ring-1 ring-brand-300 dark:bg-brand-500/20";
  const itemLook = "outline-none transition-colors select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-brand-400";
  const row = "grid w-full grid-cols-[minmax(0,1fr)_5rem] items-center gap-3 rounded-lg px-3 py-1.5 text-left sm:grid-cols-[minmax(0,1fr)_8rem_8rem_6rem]";

  return (
    <div
      className="relative space-y-4"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files") || uploading || !rights.add) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        if (!uploading && rights.add && e.dataTransfer.files.length) upload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The way back up; drag an item onto a folder here to move it up. */}
        <nav aria-label="Folder" className="flex min-w-0 flex-wrap items-center gap-1 text-lg">
          {[null, ...listing.path].map((f, i) => {
            const id = f?.id ?? null;
            const name = f?.name ?? topLabel;
            return (
              <span key={id ?? "top"} className="flex min-w-0 items-center gap-1">
                {i > 0 ? <Icon d={ICONS.chevron} className="h-4 w-4 shrink-0 text-muted" /> : null}
                {i === listing.path.length ? (
                  <h2 className="truncate px-1 font-semibold">{name}</h2>
                ) : (
                  <Link
                    href={href(id)}
                    {...dropProps(id)}
                    className={`truncate rounded-md px-1 text-muted hover:text-foreground ${dropOn === (id ?? TOP) ? "bg-brand-100 text-foreground ring-2 ring-brand-400 dark:bg-brand-500/25" : ""}`}
                  >
                    {name}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {listing.folder && shareable(listing.folder) ? (
            <Button variant="secondary" className="min-h-10" onClick={() => setSharingFolder(listing.folder)}>
              <Icon d={ICONS.people} />
              Share
            </Button>
          ) : null}
          {canNewFolder ? (
            <Button variant="secondary" className="min-h-10" onClick={newFolder} disabled={pending}>
              <Icon d={ICONS.folderPlus} />
              New folder
            </Button>
          ) : null}
          {rights.add ? (
            <Button className="min-h-10" onClick={() => pickRef.current?.click()} disabled={uploading}>
              <Icon d={ICONS.upload} />
              {mediaFolder ? "Add photos or video" : "Upload"}
            </Button>
          ) : null}
          <input
            ref={pickRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) upload([...e.target.files]);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex min-h-10 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 shadow-theme-xs focus-within:border-brand-500">
          <Icon d={ICONS.search} className="h-4 w-4 shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={listing.folder ? `Search in ${listing.folder.name}` : "Search files"}
            aria-label="Search this folder"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </label>
        <div role="group" aria-label="View" className="flex rounded-xl border border-border bg-surface p-1 shadow-theme-xs">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={v === "grid" ? "Tiles" : "Details"}
              onClick={() => chooseView(v)}
              className={`rounded-lg p-1.5 transition-colors ${view === v ? "bg-brand-500 text-white" : "text-muted hover:text-foreground"}`}
            >
              <Icon d={v === "grid" ? ICONS.grid : ICONS.list} />
            </button>
          ))}
        </div>
      </div>

      {moving ? (
        <form
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-500/40 bg-surface p-3 shadow-theme-xs"
          onSubmit={(e) => {
            e.preventDefault();
            move(moving.entries, moving.value === TOP ? null : moving.value);
          }}
        >
          <span className="text-sm font-medium">Move {moving.entries.length > 1 ? `${moving.entries.length} items` : `"${moving.entries[0].name}"`} to</span>
          <select
            aria-label="Move to"
            value={moving.value}
            onChange={(e) => setMoving({ ...moving, value: e.target.value })}
            autoFocus
            className="min-h-10 min-w-40 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
          >
            {destinations(moving.entries).map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <Button type="submit" className="min-h-10" loading={pending} disabled={pending}>
            Move
          </Button>
          <Button type="button" variant="secondary" className="min-h-10" onClick={() => setMoving(null)} disabled={pending}>
            Cancel
          </Button>
        </form>
      ) : null}

      {task && task.kind !== "todo" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-50/60 px-4 py-3 text-sm dark:bg-brand-500/10">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{task.mine ? task.title : `${task.forName ?? "Their"}${task.forName ? "'s" : ""} task: ${task.title}`}</p>
            <p className="text-xs text-muted">
              {choosing
                ? `${task.mine ? "Choose" : "Choosing"} ${task.pickMin ? `${task.pickMin} to ${task.pickMax}` : `up to ${task.pickMax}`}: tap ♥ on a photo, or open it to look closer.`
                : task.mine
                  ? "Open a photo (double-click or tap) to comment on it; pin a comment to a spot to show exactly where."
                  : "Their comments show on each photo (the number on it): open one to read and resolve them."}
              {task.dueOn ? ` Due ${formatDay(scope, task.dueOn)}.` : ""}
            </p>
          </div>
          {choosing ? (
            <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold tabular-nums shadow-sm">
              {picks.size}
              {task.pickMax ? ` / ${task.pickMax}` : ""} chosen
            </span>
          ) : null}
          {task.done ? (
            <span className="text-sm font-medium text-success-600 dark:text-success-500">✓ {choosing ? "Sent" : "Done"}</span>
          ) : task.mine ? (
            <Button
              className="min-h-9"
              loading={pending}
              disabled={choosing && picks.size < Math.max(1, task.pickMin ?? 1)}
              onClick={() => window.confirm(choosing ? `Send your ${picks.size} choices? You can't change them after, unless the business reopens it.` : "Done giving feedback?") && run(() => finishTask(via, task.id))}
            >
              {choosing ? "Send my choice" : "I'm done"}
            </Button>
          ) : null}
          {choosing && !task.mine && picks.size ? (
            <>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} />
                Only chosen
              </label>
              <Button variant="secondary" className="min-h-9" onClick={copyForLightroom}>
                {copied ? "Copied" : "Copy for Lightroom"}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {chosen.length > 1 || selecting ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-500/40 bg-surface px-3 py-2 text-sm shadow-theme-xs">
          <span className="font-medium">{chosen.length} selected</span>
          {chosen.length > 1 && chosen.every(changeable) ? (
            <>
              <Button variant="ghost" className="min-h-8" onClick={() => setRenaming(chosen)}>
                Rename
              </Button>
              {destinations(chosen).length ? (
                <Button variant="ghost" className="min-h-8" onClick={() => setMoving({ entries: chosen, value: destinations(chosen)[0].value })}>
                  Move
                </Button>
              ) : null}
              <Button variant="ghost" className="min-h-8 text-error-600" onClick={() => remove(chosen[0])}>
                Delete
              </Button>
            </>
          ) : null}
          <Button variant="secondary" className="ml-auto min-h-8" onClick={clearSelection}>
            {selecting ? "Done" : "Clear"}
          </Button>
        </div>
      ) : null}

      {listing.note ? <p className="text-sm text-muted">{listing.note}</p> : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}

      {uploads.length > 0 ? (
        <section aria-label="Uploads" className="space-y-2 rounded-2xl border border-border bg-surface p-3 shadow-theme-xs">
          {uploads.map((u, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{u.name}</span>
                <span className={`shrink-0 text-xs ${u.state === "failed" ? "text-error-600 dark:text-error-400" : "text-muted"}`}>
                  {u.state === "done" ? "Uploaded" : u.state === "failed" ? (u.error ?? "Failed") : u.state === "waiting" ? "Waiting" : `${Math.round(u.progress * 100)}%`}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full rounded-full transition-[width] ${u.state === "failed" ? "bg-error-500" : "bg-brand-500"}`}
                  style={{ width: `${u.state === "done" ? 100 : Math.round(u.progress * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* The space the items sit in: right-click it for New folder / Upload / View; clicking it clears the selection. */}
      <div
        ref={area}
        className="min-h-64"
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest("[data-item], input, textarea")) startBox(e);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !(e.target as HTMLElement).closest("input, textarea")) {
            e.preventDefault();
            setSelected(new Set(entries.map(keyOf)));
          } else if (e.key === "Escape") clearSelection();
        }}
        onContextMenu={(e) => {
          if (e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea")) return;
          e.preventDefault();
          clearSelection();
          setMenu({ x: e.clientX, y: e.clientY, entry: null });
        }}
      >
        {empty ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <FolderArt className="h-16 w-20 opacity-60" />
            <p className="text-sm text-muted">
              {query
                ? `Nothing here matches "${query.trim()}".`
                : !rights.add
                  ? here
                    ? "This folder is empty."
                    : "Nothing has been shared with you yet."
                  : here
                    ? "This folder is empty. Drop files here, or press Upload."
                    : "No files yet. Drop files here, or press Upload."}
            </p>
            {rights.add ? <p className="text-xs text-muted">Any file, up to {formatBytes(MAX_FILE_BYTES)} each, kept as it is.</p> : null}
          </div>
        ) : view === "grid" ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]">
            {newFolderShown ? (
              <li className={editingTile}>
                <span className="flex h-16 items-center">
                  <FolderArt className="h-14 w-[4.5rem]" />
                </span>
                {nameInput(false, "w-full text-center text-xs")}
              </li>
            ) : null}
            {entries.map((e) => (
              <li key={keyOf(e)} className="relative">
                {e.kind === "file" ? heart(e.id, "absolute top-1 left-1") : null}
                {naming?.key === keyOf(e) ? (
                  <div className={editingTile}>
                    <span className="flex h-16 items-center">
                      <Glyph entry={e} large shared={sharedFolders.has(e.id) && e.kind === "folder"} />
                    </span>
                    {nameInput(e.kind === "file", "w-full text-center text-xs")}
                  </div>
                ) : (
                  <button type="button" {...itemProps(e)} className={`flex w-full flex-col items-center gap-1.5 rounded-xl p-2 text-center ${itemLook} ${stateClass(e)}`}>
                    <span className="flex h-16 items-center">
                      <Glyph entry={e} large shared={sharedFolders.has(e.id) && e.kind === "folder"} />
                    </span>
                    <span className={`w-full text-xs leading-tight break-words ${selected.has(keyOf(e)) && chosen.length === 1 ? "" : "line-clamp-2"}`}>{e.name}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm">
            <div className={`${row} border-b border-border text-xs font-medium text-muted`}>
              <span>Name</span>
              <span className="hidden sm:block">Date</span>
              <span className="hidden sm:block">Type</span>
              <span className="text-right">Size</span>
            </div>
            <ul className="pt-1">
              {newFolderShown ? (
                <li className={`${row} bg-brand-100/80 dark:bg-brand-500/20`}>
                  <span className="flex min-w-0 items-center gap-3">
                    <FolderArt className="h-5 w-6 shrink-0" />
                    {nameInput(false, "min-w-0 flex-1 text-sm")}
                  </span>
                </li>
              ) : null}
              {entries.map((e) => {
                const cells = (
                  <>
                    <span className="hidden truncate text-muted sm:block">{e.kind === "file" && e.file.createdAt ? formatDay(scope, e.file.createdAt) : ""}</span>
                    <span className="hidden truncate text-muted sm:block">{typeName(e)}</span>
                    <span className="text-right text-muted tabular-nums">{e.kind === "file" ? formatBytes(e.file.bytes) : ""}</span>
                  </>
                );
                const glyph = (
                  <span className="flex w-6 shrink-0 justify-center">
                    <Glyph entry={e} large={false} shared={sharedFolders.has(e.id) && e.kind === "folder"} />
                  </span>
                );
                return (
                  <li key={keyOf(e)} className="relative">
                    {e.kind === "file" ? heart(e.id, "absolute top-1/2 -left-1 -translate-y-1/2 h-6 w-6 text-sm") : null}
                    {naming?.key === keyOf(e) ? (
                      <div className={`${row} bg-brand-100/80 dark:bg-brand-500/20`}>
                        <span className="flex min-w-0 items-center gap-3">
                          {glyph}
                          {nameInput(e.kind === "file", "min-w-0 flex-1 text-sm")}
                        </span>
                        {cells}
                      </div>
                    ) : (
                      <button type="button" {...itemProps(e)} className={`${row} ${itemLook} ${stateClass(e)}`}>
                        <span className="flex min-w-0 items-center gap-3">
                          {glyph}
                          <span className="truncate">{e.name}</span>
                        </span>
                        {cells}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <p className="hidden text-xs text-muted sm:block">
        Double-click to open and comment · right-click for options · Ctrl/⌘ or Shift to pick several, or drag a box
        {rights.change ? " · F2 renames · drag onto a folder to move" : ""}
        {rights.add ? " · drop files anywhere to upload" : ""}
      </p>
      <p className="text-xs text-muted sm:hidden">Tap to open · press and hold for options or to select several</p>

      {box ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-30 rounded border border-brand-500 bg-brand-500/10"
          style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
        />
      ) : null}

      {viewing !== null && shownFiles[viewing] ? (
        <FileViewer
          files={shownFiles}
          index={viewing}
          via={via}
          scope={scope}
          canResolve={rights.change}
          canDelete={rights.share}
          extra={
            choosing
              ? (f) =>
                  canPick || picks.has(f.id) ? (
                    <Button variant={picks.has(f.id) ? "primary" : "secondary"} className="min-h-9" disabled={!canPick} onClick={() => togglePick(f.id)}>
                      {picks.has(f.id) ? "♥ Chosen" : "♡ Choose"}
                    </Button>
                  ) : null
              : undefined
          }
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}

      {renaming ? (
        <BatchRename
          items={renaming.map((e) => ({ kind: e.kind, id: e.id, name: e.name, createdAt: e.kind === "file" ? e.file.createdAt : null }))}
          others={[...listing.folders, ...listing.files].filter((x) => !renaming.some((e) => e.id === x.id)).map((x) => x.name)}
          folderName={listing.folder?.name ?? null}
          pending={pending}
          error={error}
          onApply={(items) =>
            run(
              () => renameMany(via, { folderId: here, items }),
              () => {
                setRenaming(null);
                clearSelection();
              },
            )
          }
          onClose={() => setRenaming(null)}
        />
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.entry ? `Options for ${menu.entry.name}` : "Folder options"}
          entries={menu.entry ? itemMenu(menu.entry, menu.touch ?? false) : backgroundMenu}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {sharing && sharingFolder ? (
        <ShareDialog
          folder={sharingFolder}
          shares={sharing.shares.filter((s) => s.folderId === sharingFolder.id)}
          people={sharing.people}
          linkBase={sharing.linkBase}
          onClose={() => setSharingFolder(null)}
        />
      ) : null}

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50/90 dark:bg-brand-500/15">
          <FolderArt className="h-16 w-20" />
          <p className="text-sm font-medium">Drop to upload to {listing.folder?.name ?? topLabel}</p>
        </div>
      ) : null}
    </div>
  );
}
