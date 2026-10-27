"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition, type DragEvent } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { BatchRename } from "@repo/ui/files/BatchRename";
import { createInBusiness, deleteInBusiness, moveInBusiness, newBusinessName, renameInBusiness } from "@repo/ui/files/business-actions";
import { ContextMenu, type ContextEntry } from "@repo/ui/files/ContextMenu";
import { FileViewer } from "@repo/ui/files/FileViewer";
import { FolderArt } from "@repo/ui/files/FolderArt";
import { PackagesPanel } from "@repo/ui/files/PackagesPanel";
import { ProofCover, useProofShield, Watermark } from "@repo/ui/files/proof";
import { saveAsZips } from "@repo/ui/files/zip";
import { ShareDialog, type SharePeople } from "@repo/ui/files/ShareDialog";
import { uploadServiceMedia } from "@repo/ui/files/media-upload";
import { putSigned } from "@repo/ui/photos/browser";
import {
  confirmFileUpload,
  createFolder,
  deleteFile,
  captionFile,
  downloadLinks,
  finishTask,
  gatherChoice,
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
  kind: "todo" | "choose" | "feedback" | "name";
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
  return entry.folder.holdsProjects ? "Every project" : entry.folder.holdsJobs ? "Vendor jobs" : entry.folder.projectId ? "Project folder" : "File folder";
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
  back: "M15.75 19.5 8.25 12l7.5-7.5",
  plus: "M12 4.5v15m7.5-7.5h-15",
  more: "M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z",
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

/** A picture's tile: its thumbnail; before it has one, a small original (a service's photos are already small). */
function tileOf(file: FileView): string | null {
  if (!file.contentType.startsWith("image/")) return null;
  return file.thumbUrl ?? (file.previewUrl && (file.bytes <= PREVIEW_BYTES || file.media) ? file.previewUrl : null);
}

/**
 * How an item looks on a phone: a folder as a row, a photo as a square
 * filling its cell (like a phone's gallery), anything else as its type over
 * its name.
 */
function PhoneTile({ entry: e, selected, shared }: { entry: Entry; selected: boolean; shared: boolean }) {
  if (e.kind === "folder") {
    const tag = e.folder.business ? null : e.folder.holdsProjects ? "Every project" : e.folder.holdsJobs ? "Vendor jobs" : e.folder.projectId ? "Project" : shared ? "Shared" : null;
    return (
      <span className="flex w-full items-center gap-3 pr-10 text-left">
        <FolderArt className="h-9 w-11 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{e.name}</span>
          {tag ? <span className="block text-xs text-muted">{tag}</span> : null}
        </span>
      </span>
    );
  }
  const tile = tileOf(e.file);
  return (
    <span className="relative block w-full">
      <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-background">
        {tile ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived storage link
          <img src={tile} alt={e.name} loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <Picture entry={e} large shared={false} />
        )}
      </span>
      {tile ? null : <span className="block truncate px-1 py-1 text-center text-[11px]">{e.name}</span>}
      {e.file.openComments ? (
        <span className="absolute right-1 bottom-1 rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-white shadow-sm">{e.file.openComments}</span>
      ) : null}
      {selected ? (
        <span className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs text-white shadow ring-2 ring-white">✓</span>
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
        {isLocked(e.folder) && !e.folder.business ? corner(ICONS.lock, "-right-1", "Kept with its project") : null}
        {shared ? corner(ICONS.people, "-left-1", "Shared") : null}
      </span>
    );
  }
  // A picture's tile is its thumbnail; before it has one, a small original (a service's photos are already small).
  const image = e.file.contentType.startsWith("image/");
  const tile = tileOf(e.file);
  if (tile) {
    return (
      <span className="relative inline-flex">
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived storage link */}
        <img src={tile} alt="" loading="lazy" decoding="async" draggable={false} className={`rounded-md object-cover shadow-sm ${large ? "h-14 w-16" : "h-5 w-6"}`} />
        {e.file.media?.kind === "photo" && e.file.media.cover ? corner(ICONS.star, "-right-1", "The cover") : null}
      </span>
    );
  }
  // A proof whose small copies aren't made yet: never the original.
  if (image && !e.file.previewUrl && !e.file.downloadUrl) {
    return (
      <span className={`inline-flex animate-pulse items-center justify-center rounded-md bg-background text-center text-muted ${large ? "h-14 w-16 text-[9px]" : "h-5 w-6 text-[6px]"}`}>
        Preparing…
      </span>
    );
  }
  return <KindBadge file={e.file} large={large} />;
}

// A phone (narrower than the sm breakpoint): menus and forms come up as bottom sheets.
const PHONE = "(max-width: 639px)";
function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isPhone = () => window.matchMedia(PHONE).matches;

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
  protect,
  picker,
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
  /**
   * Proofs (photos still in production): watermarked, no saving or printing
   * them from the page, covered when it loses focus (see ./proof.tsx).
   */
  protect?: { watermark: string };
  /**
   * Picking files for something else (the order form's "From my Drive",
   * ./DrivePicker.tsx): folders open in place, a tap ticks a file, a
   * folder's tick takes all of it, and nothing here is changed (pass
   * read-only rights).
   */
  picker?: {
    picked: ReadonlySet<string>;
    onToggle: (file: FileView) => void;
    onToggleFolder: (folder: Folder) => void;
    onOpen: (folderId: string | null) => void;
  };
}) {
  const router = useRouter();
  const here = listing.folder?.id ?? null;
  const rights = listing.rights;
  const covered = useProofShield(!!protect);
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const view = useSyncExternalStore(subscribeView, readView, () => "grid" as const);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** On a phone: taps pick items instead of opening them (from "Select" in the long-press menu). */
  const [selecting, setSelecting] = useState(false);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [renaming, setRenaming] = useState<{ entries: Entry[]; pattern?: string; dedupe?: boolean } | null>(null);
  const [moving, setMoving] = useState<{ entries: Entry[]; value: string } | null>(null);
  const [picks, setPicks] = useState<ReadonlySet<string>>(() => new Set(task?.picks ?? []));
  // A sent choice opens on just the chosen photos (the business looking at it).
  const [onlyPicked, setOnlyPicked] = useState(() => task?.kind === "choose" && task.done && !task.mine && task.picks.length > 0);
  /** "Send?" before a task is sent, as a sheet. */
  const [confirming, setConfirming] = useState(false);
  /** Where "Download chosen ▾" opened its choice. */
  const [downloadMenu, setDownloadMenu] = useState<{ x: number; y: number } | null>(null);
  /** Captions as typed (a "name" task), and as last saved. */
  const [captions, setCaptions] = useState<ReadonlyMap<string, string>>(() => new Map(listing.files.map((f) => [f.id, f.caption ?? ""])));
  const savedCaptions = useRef<Map<string, string>>(new Map(listing.files.map((f) => [f.id, f.caption ?? ""])));
  const [copied, setCopied] = useState(false);
  /** The file open in the viewer: its place among the files shown. */
  const [viewing, setViewing] = useState<number | null>(null);
  /** On a phone: the + button's sheet (Upload, New folder, Share). */
  const [adding, setAdding] = useState(false);
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
  // A "name" task: a name box under each photo; Enter saves and goes to the next.
  const namingTask = task?.kind === "name";
  const canName = namingTask && task.mine && !task.done;
  const named = listing.files.filter((f) => (captions.get(f.id) ?? "").trim()).length;
  function saveCaption(fileId: string) {
    const value = (captions.get(fileId) ?? "").trim();
    if (value === savedCaptions.current.get(fileId)) return;
    savedCaptions.current.set(fileId, value);
    setError(null);
    captionFile(via, fileId, value, task?.id).then((res) => {
      if (res.ok) return router.refresh();
      savedCaptions.current.delete(fileId);
      setError(res.error);
    });
  }
  function captionBox(fileId: string, className: string) {
    if (!namingTask) return null;
    if (!canName) {
      const text = captions.get(fileId);
      return <p className={`truncate text-center text-xs ${text ? "font-medium" : "text-muted italic"} ${className}`}>{text || "No name yet"}</p>;
    }
    return (
      <input
        data-caption
        aria-label="Names on this photo"
        value={captions.get(fileId) ?? ""}
        placeholder="Names…"
        maxLength={500}
        onChange={(ev) => setCaptions((c) => new Map(c).set(fileId, ev.target.value))}
        onBlur={() => saveCaption(fileId)}
        onKeyDown={(ev) => {
          ev.stopPropagation();
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          // On to the next photo's box (blurring this one saves it).
          const boxes = [...(area.current?.querySelectorAll<HTMLInputElement>("input[data-caption]") ?? [])];
          const at = boxes.indexOf(ev.currentTarget);
          const next = at >= 0 ? boxes[at + 1] : undefined;
          if (next) next.focus();
          else ev.currentTarget.blur();
        }}
        onClick={(ev) => ev.stopPropagation()}
        className={`w-full rounded-md border border-border bg-surface px-1.5 py-1 text-center text-xs outline-none focus:border-brand-500 ${className}`}
      />
    );
  }
  /** The names as a list to download: each file with the names on it. */
  function downloadNames() {
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [["File", "Names", "Folder"], ...listing.files.map((f) => [f.name, captions.get(f.id) ?? "", listing.folder?.name ?? topLabel])];
    const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${listing.folder?.name ?? "names"} - names.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
    picker ? (
      <button
        type="button"
        aria-pressed={picker.picked.has(fileId)}
        aria-label={picker.picked.has(fileId) ? "Ticked: tap to untick" : "Tick this one"}
        onClick={(ev) => {
          ev.stopPropagation();
          const file = listing.files.find((f) => f.id === fileId);
          const folder = listing.folders.find((f) => f.id === fileId);
          if (file) picker.onToggle(file);
          else if (folder) picker.onToggleFolder(folder);
        }}
        className={`z-10 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shadow-sm transition ${
          picker.picked.has(fileId) ? "bg-brand-500 text-white" : "border-[1.5px] border-white bg-gray-950/30 text-transparent"
        } ${className}`}
      >
        ✓
      </button>
    ) : choosing && (canPick || picks.has(fileId)) ? (
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
    if (picker) return e.kind === "folder" ? picker.onOpen(e.id) : picker.onToggle(e.file);
    if (e.kind === "folder") router.push(href(e.id));
    else setViewing(shownFiles.findIndex((f) => f.id === e.id));
  }
  const download = (url: string | null | undefined) => url && window.location.assign(url);

  // Zips (made in the browser): chosen files, or a folder with everything in it, as originals or optimised copies.
  const [zipping, setZipping] = useState<string | null>(null);
  function zip(pick: { fileIds: string[] } | { folderId: string }, name: string, version: "original" | "optimised") {
    setError(null);
    setZipping("Getting the list…");
    downloadLinks(via, { pick, version })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.error);
        if (res.data.length === 0) throw new Error("There's nothing here you can download.");
        await saveAsZips(res.data, version === "optimised" ? `${name} (optimised)` : name, setZipping);
      })
      .catch((err: unknown) => {
        setZipping(null);
        setError(err instanceof Error ? err.message : "The zip couldn't be made.");
      });
  }
  /** "Download as zip" for files you may download (not the Business folders, which aren't stored files). */
  const zipMenu = (pick: { fileIds: string[] } | { folderId: string }, name: string, what: string): ContextEntry[] =>
    rights.download && !listing.folder?.business && !zipping
      ? [
          { label: `Download ${what} as zip (originals)`, onSelect: () => zip(pick, name, "original") },
          { label: `Download ${what} as zip (optimised)`, onSelect: () => zip(pick, name, "optimised") },
        ]
      : [];

  const sharedFolders = new Set(sharing?.shares.map((s) => s.folderId));
  /** Whether the person may rename, move or delete `e`. */
  const changeable = (e: Entry) => rights.change && !isLockedEntry(e);
  /** A Business category, service or product: renamed, moved and deleted for real (packages/lib/offerings). */
  const bizOf = (e: Entry) => (e.kind === "folder" && (e.folder.business?.kind === "category" || e.folder.business?.kind === "item") ? e.folder.business : null);
  /** Aming's products keep Aming's names. */
  const bizRenamable = (e: Entry) => {
    const b = bizOf(e);
    return b !== null && !(b.kind === "item" && b.fromAming);
  };

  function rename(e: Entry) {
    if (bizOf(e)) {
      if (!bizRenamable(e) || actOn(e).length > 1) return;
      selectOnly(keyOf(e));
      return setNaming({ key: keyOf(e), value: e.name });
    }
    const many = actOn(e);
    if (!many.every(changeable)) return;
    if (many.length > 1) return setRenaming({ entries: many });
    selectOnly(keyOf(e));
    setNaming({ key: keyOf(e), value: e.name });
  }

  /** A service's or product's folder takes photos and a video, not folders. */
  const mediaFolder = listing.folder?.business?.kind === "item" ? listing.folder.business : null;
  /** In Services or Products: a new category; in a category: a new service or product. */
  const bizHere = listing.folder?.business ?? null;
  const bizNew = bizHere ? newBusinessName(bizHere) : null;
  const canNewFolder = bizHere ? bizNew !== null : rights.add;
  const shareable = (f: Folder) => sharing !== undefined && f.business === undefined;

  function newFolder() {
    if (!canNewFolder) return;
    setQuery("");
    clearSelection();
    setNaming({ key: NEW, value: uniqueName(bizNew ?? "New folder", listing.folders.map((f) => f.name)) });
  }

  function saveName() {
    if (!naming) return;
    const value = naming.value.trim();
    if (naming.key === NEW) {
      if (!value) return setNaming(null);
      if (bizHere) return run(() => createInBusiness(bizHere, value), () => setNaming(null));
      return run(() => createFolder(via, { parentId: here, name: value }), () => setNaming(null));
    }
    const e = entries.find((x) => keyOf(x) === naming.key);
    if (!e || !value || value === e.name) return setNaming(null);
    const b = bizOf(e);
    if (b) return run(() => renameInBusiness(b, value), () => setNaming(null));
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
    const b = bizOf(e);
    if (b) {
      if (actOn(e).length > 1) return;
      const inside = listing.allFolders.filter((f) => f.parentId === e.id).length;
      const question =
        b.kind === "category"
          ? `Delete the category "${e.name}"${inside ? ` with its ${inside} ${b.offering === "service" ? "service" : "product"}${inside === 1 ? "" : "s"}, their packages and photos` : ""}? This can't be undone.`
          : `Delete "${e.name}" with its ${b.offering === "service" ? "packages" : "sizes"} and photos? Quotations and invoices keep their copy. This can't be undone.`;
      if (!window.confirm(question)) return;
      return run(() => deleteInBusiness(b), clearSelection);
    }
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
    const b = bizOf(e);
    if (b) {
      // A service or product moves into another category of its kind.
      if (b.kind !== "item" || e.kind !== "folder" || !to || to === e.folder.parentId) return false;
      const target = listing.allFolders.find((f) => f.id === to)?.business;
      return target?.kind === "category" && target.offering === b.offering;
    }
    if (!changeable(e) || to === here) return false;
    if (!(to === null ? listing.addable.top : listing.addable.folders.includes(to))) return false;
    return !(e.kind === "folder" && to && isWithin(listing.allFolders, to, e.id));
  }

  function move(items: Entry[], to: string | null) {
    const target = listing.allFolders.find((f) => f.id === to)?.business;
    if (target && items.every((x) => bizOf(x))) {
      return run(
        () => each(items, (x) => moveInBusiness(bizOf(x)!, target)),
        () => {
          setMoving(null);
          clearSelection();
        },
      );
    }
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
    const fileIds = items.flatMap((e) => (e.kind === "file" && !e.file.media ? [e.id] : []));
    return [
      { note: `${items.length} selected` },
      ...(fileIds.length ? zipMenu({ fileIds }, listing.folder?.name ?? topLabel, fileIds.length === items.length ? `${fileIds.length} files` : `the ${fileIds.length} files`) : []),
      ...(all
        ? ([
            { label: `Rename ${items.length} items…`, onSelect: () => setRenaming({ entries: items }) },
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
            ...(e.file.optimisedUrl
              ? [
                  { label: "Download original", onSelect: () => download(e.file.downloadUrl) },
                  { label: "Download optimised", onSelect: () => download(e.file.optimisedUrl) },
                ]
              : e.file.downloadUrl
                ? [{ label: "Download", onSelect: () => download(e.file.downloadUrl) }]
                : [{ note: "Shared with you to look at, without downloads." }]),
          ];
    // A folder downloads with everything in it.
    const folderZip = e.kind === "folder" && !e.folder.business ? zipMenu({ folderId: e.id }, e.name, "folder") : [];
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
    const b = bizOf(e);
    if (b) {
      const places = destinations([e]);
      return [
        ...opener,
        ...select,
        "-",
        ...(bizRenamable(e) ? [{ label: "Rename", onSelect: () => rename(e) }] : [{ note: "Picked from Aming: it keeps Aming's name." }]),
        ...(places.length ? [{ label: "Move to category…", onSelect: () => setMoving({ entries: [e], value: places[0].value }) }] : []),
        "-",
        { label: "Delete", danger: true, onSelect: () => remove(e) },
      ];
    }
    if (isLockedEntry(e)) {
      const business = e.kind === "folder" ? e.folder.business : undefined;
      const note = business
        ? "What your business sells: open it to add, rename or move categories, services and products."
        : e.kind === "folder" && e.folder.holdsProjects
          ? "Holds a folder for every project. It stays as it is."
          : "Made with its project and named after it. Rename the project to rename it.";
      return [...opener, ...folderZip, ...select, ...share, "-", { note }];
    }
    if (!rights.change) return [...opener, ...folderZip, ...select, ...share];
    const places = destinations([e]);
    return [
      ...opener,
      ...folderZip,
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
    ...(canNewFolder ? [{ label: bizNew ?? "New folder", onSelect: newFolder }] : []),
    ...(rights.add ? ([{ label: mediaFolder ? "Add photos or a video" : "Upload files", onSelect: () => pickRef.current?.click() }, "-"] satisfies ContextEntry[]) : []),
    ...(entries.length ? ([{ label: "Select all", onSelect: () => setSelected(new Set(entries.map(keyOf))) }, "-"] satisfies ContextEntry[]) : []),
    ...(here ? zipMenu({ folderId: here }, listing.folder?.name ?? topLabel, "this folder") : []),
    ...(here && rights.download && !listing.folder?.business ? (["-"] satisfies ContextEntry[]) : []),
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
      if (picker) return;
      if (!selected.has(key)) selectOnly(key);
      setMenu({ x, y, entry: e, touch: press.current.touch });
    };
    return {
      "data-item": key,
      draggable: changeable(e) || bizOf(e)?.kind === "item",
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
        if (picker) return open(e);
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
      onDragStart: (ev: DragEvent) => {
        dragged.current = actOn(e).filter((x) => changeable(x) || bizOf(x)?.kind === "item");
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
    if (picker && picker.picked.has(e.id)) return "bg-brand-100/80 ring-2 ring-brand-500 dark:bg-brand-500/20";
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
      className={`relative space-y-4 ${protect ? "select-none print:hidden" : ""}`}
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
      {/* On a phone: back, and where you are. */}
      <div className="flex min-w-0 items-center gap-1 sm:hidden">
        {listing.path.length ? (
          picker ? (
            <button
              type="button"
              onClick={() => picker.onOpen(listing.path.length > 1 ? listing.path[listing.path.length - 2].id : null)}
              aria-label={`Back to ${listing.path.length > 1 ? listing.path[listing.path.length - 2].name : topLabel}`}
              className="-ml-2 rounded-full p-2 text-muted active:bg-background"
            >
              <Icon d={ICONS.back} className="h-5 w-5" />
            </button>
          ) : (
            <Link
              href={href(listing.path.length > 1 ? listing.path[listing.path.length - 2].id : null)}
              aria-label={`Back to ${listing.path.length > 1 ? listing.path[listing.path.length - 2].name : topLabel}`}
              className="-ml-2 rounded-full p-2 text-muted active:bg-background"
            >
              <Icon d={ICONS.back} className="h-5 w-5" />
            </Link>
          )
        ) : null}
        <h2 className="truncate text-lg font-semibold">{listing.folder?.name ?? topLabel}</h2>
      </div>
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
      <div className="hidden flex-wrap items-center justify-between gap-3 sm:flex">
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
                ) : picker ? (
                  <button type="button" onClick={() => picker.onOpen(id)} className="truncate rounded-md px-1 text-muted hover:text-foreground">
                    {name}
                  </button>
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
              {bizNew ?? "New folder"}
            </Button>
          ) : null}
          {rights.add ? (
            <Button className="min-h-10" onClick={() => pickRef.current?.click()} disabled={uploading}>
              <Icon d={ICONS.upload} />
              {mediaFolder ? "Add photos or video" : "Upload"}
            </Button>
          ) : null}
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

      {moving && phone ? (
        <BottomSheet open onClose={() => setMoving(null)} title={`Move ${moving.entries.length > 1 ? `${moving.entries.length} items` : `"${moving.entries[0].name}"`} to`}>
          <ul className="-mx-2">
            {destinations(moving.entries).map((d) => (
              <li key={d.value}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => move(moving.entries, d.value === TOP ? null : d.value)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left active:bg-background"
                >
                  <FolderArt className="h-7 w-8 shrink-0" />
                  <span className="truncate">{d.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </BottomSheet>
      ) : moving ? (
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
        // The task, stacked at every width: what it is, for whom and when; one line of how; how far along; then what can be done.
        <section aria-label="The task" className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase">
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {choosing ? "Choose photos" : namingTask ? "Name the photos" : "Give feedback"}
                </span>
                {task.dueOn && !task.done ? <span className="rounded-full bg-background px-2.5 py-0.5 text-muted">Due {formatDay(scope, task.dueOn)}</span> : null}
                {task.done ? <span className="rounded-full bg-success-50 px-2.5 py-0.5 text-success-700 dark:bg-success-500/15 dark:text-success-500">✓ {choosing || namingTask ? "Sent" : "Done"}</span> : null}
              </div>
              <h3 className="text-lg leading-snug font-semibold">{task.title}</h3>
              {!task.mine && task.forName ? <p className="text-sm font-medium">For {task.forName}</p> : null}
              <p className="text-sm text-muted">
                {task.done && task.mine
                  ? "Thank you, it's with the business. To change anything, ask them to reopen it."
                  : choosing
                    ? task.mine
                      ? `Tap ♥ on the ${task.pickMin ? `${task.pickMin} to ${task.pickMax}` : `${task.pickMax} or fewer`} you want. Open a photo to see it bigger.`
                      : task.done
                        ? "Their choice is in. The chosen photos are marked ♥."
                        : `They're choosing ${task.pickMin ? `${task.pickMin} to ${task.pickMax}` : `up to ${task.pickMax}`}; their picks so far are marked ♥.`
                    : namingTask
                      ? task.mine
                        ? "Type the names under each photo, commas between several. Enter goes to the next."
                        : "Their names show under each photo."
                      : task.mine
                        ? "Open a photo to comment on it. Pin a comment to point at a spot."
                        : "Their comments show on each photo: open one to read and resolve them."}
              </p>
            </div>
            {!task.done && task.mine ? (
              <Button className="min-h-11 w-full shrink-0 sm:w-auto" loading={pending} disabled={choosing && picks.size < Math.max(1, task.pickMin ?? 1)} onClick={() => setConfirming(true)}>
                {choosing ? "Send my choice" : namingTask ? "Send names" : "I'm done"}
              </Button>
            ) : null}
          </div>

          {choosing || namingTask ? (
            <div className="max-w-xl space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted">{choosing ? (task.pickMin && picks.size < task.pickMin ? `At least ${task.pickMin}` : "Chosen") : "Named"}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {choosing ? picks.size : named} of (choosing ? (task.pickMax ?? listing.files.length) : listing.files.length)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuemin={0} aria-valuemax={(choosing ? (task.pickMax ?? listing.files.length) : listing.files.length)} aria-valuenow={choosing ? picks.size : named}>
                <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${Math.min(100, Math.round((100 * (choosing ? picks.size : named)) / Math.max(1, (choosing ? (task.pickMax ?? listing.files.length) : listing.files.length))))}%` }} />
              </div>
            </div>
          ) : null}

          {/* What the business can do with it. */}
          {(choosing && !task.mine && picks.size) || (namingTask && !task.mine && named) ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {choosing ? (
                <div role="group" aria-label="Show" className="flex rounded-xl border border-border bg-background p-1">
                  {[false, true].map((only) => (
                    <button
                      key={String(only)}
                      type="button"
                      aria-pressed={onlyPicked === only}
                      onClick={() => setOnlyPicked(only)}
                      className={`min-h-9 rounded-lg px-3 text-sm font-medium transition-colors ${onlyPicked === only ? "bg-surface text-foreground shadow-theme-xs" : "text-muted"}`}
                    >
                      {only ? `♥ Chosen (${picks.size})` : `All (${listing.files.length})`}
                    </button>
                  ))}
                </div>
              ) : null}
              {/* Sent before choices were gathered automatically: no "Chosen by …" folder yet. */}
              {choosing && task.done && rights.change && via.as === "studio" && ![listing.folder, ...listing.folders].some((f) => f?.name.startsWith("Chosen by")) ? (
                <Button
                  variant="secondary"
                  className="min-h-11"
                  loading={pending}
                  onClick={() =>
                    run(async () => {
                      const res = await gatherChoice(task.id);
                      if (res.ok) router.push(`${href(res.data)}&task=${task.id}`);
                      return res;
                    })
                  }
                >
                  Put the chosen in a folder
                </Button>
              ) : null}
              {choosing ? (
                <Button variant="secondary" className="min-h-11" onClick={copyForLightroom}>
                  {copied ? "Copied ✓" : "Copy for Lightroom"}
                </Button>
              ) : null}
              {namingTask && rights.change ? (
                <Button
                  variant="secondary"
                  className="min-h-11"
                  onClick={() =>
                    setRenaming({
                      entries: entries.filter((e) => e.kind === "file" && (captions.get(e.id) ?? "").trim()),
                      pattern: "{caption}",
                      dedupe: true,
                    })
                  }
                >
                  Use names as file names
                </Button>
              ) : null}
              {namingTask ? (
                <Button variant="secondary" className="min-h-11" onClick={downloadNames}>
                  Download list
                </Button>
              ) : null}
              {choosing && rights.download ? (
                <Button
                  variant="secondary"
                  className="min-h-11"
                  disabled={!!zipping}
                  onClick={(ev) => {
                    const r = ev.currentTarget.getBoundingClientRect();
                    setDownloadMenu({ x: r.left, y: r.bottom + 4 });
                  }}
                >
                  Download chosen ▾
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {task && downloadMenu ? (
        <ContextMenu
          x={downloadMenu.x}
          y={downloadMenu.y}
          label="Download the chosen photos"
          title={`Download the ${picks.size} chosen`}
          entries={[
            { label: "Originals (full size)", onSelect: () => zip({ fileIds: [...picks] }, `${task.title} - chosen`, "original") },
            { label: "Optimised (quick to send)", onSelect: () => zip({ fileIds: [...picks] }, `${task.title} - chosen`, "optimised") },
          ]}
          onClose={() => setDownloadMenu(null)}
        />
      ) : null}
      {task && confirming ? (
        <BottomSheet open onClose={() => setConfirming(false)} title={choosing ? "Send your choice?" : namingTask ? "Send the names?" : "Finished?"}>
          <div className="space-y-4 text-sm">
            <p>
              {choosing
                ? `You've chosen ${picks.size} photo${picks.size === 1 ? "" : "s"}.`
                : namingTask
                  ? named < listing.files.length
                    ? `${listing.files.length - named} of ${listing.files.length} photos still have no name.`
                    : `All ${listing.files.length} photos have names.`
                  : "The business will see your comments."}{" "}
              {choosing || namingTask ? "Once sent, they can't be changed unless the business reopens the task." : ""}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" className="min-h-11" onClick={() => setConfirming(false)}>
                Keep going
              </Button>
              <Button className="min-h-11" loading={pending} onClick={() => run(() => finishTask(via, task.id), () => setConfirming(false))}>
                {choosing ? "Send my choice" : namingTask ? "Send names" : "Yes, I'm done"}
              </Button>
            </div>
          </div>
        </BottomSheet>
      ) : null}

      {chosen.length > 1 || selecting ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-500/40 bg-surface px-3 py-2 text-sm shadow-theme-xs">
          <span className="font-medium">{chosen.length} selected</span>
          {chosen.length > 1 && chosen.every(changeable) ? (
            <>
              <Button variant="ghost" className="min-h-8" onClick={() => setRenaming({ entries: chosen })}>
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
      {listing.packages && mediaFolder ? <PackagesPanel serviceId={mediaFolder.serviceId} packages={listing.packages} /> : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      {zipping ? (
        <p role="status" className="text-sm text-muted">
          {zipping} Keep this page open until the zip downloads.
        </p>
      ) : null}

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
          if (picker || e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea")) return;
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
                : bizNew
                  ? `Nothing here yet. Press "${bizNew}" (or right-click) to add one.`
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
          // A phone: folders as rows, then photos three to a row, square (a gallery); wider: tiles.
          <ul className="grid grid-cols-3 gap-0.5 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] sm:gap-2">
            {newFolderShown ? (
              <li className={`col-span-3 sm:col-span-1 ${editingTile}`}>
                <span className="flex h-16 items-center">
                  <FolderArt className="h-14 w-[4.5rem]" />
                </span>
                {nameInput(false, "w-full text-center text-xs")}
              </li>
            ) : null}
            {entries.map((e) => (
              <li key={keyOf(e)} className={`relative ${e.kind === "folder" ? "col-span-3 mb-1 sm:col-span-1 sm:mb-0" : ""}`}>
                {e.kind === "file" || picker ? heart(e.id, e.kind === "folder" ? "absolute top-1/2 right-3 -translate-y-1/2 sm:top-3 sm:right-auto sm:left-3 sm:translate-y-0" : "absolute top-1.5 left-1.5 sm:top-3 sm:left-3") : null}
                {protect && e.kind === "file" && e.file.previewUrl && e.file.contentType.startsWith("image/") ? (
                  <span className="pointer-events-none absolute inset-x-0 top-0 aspect-square sm:inset-x-2 sm:top-2">
                    <Watermark text={protect.watermark} />
                  </span>
                ) : null}
                {/* A phone has no right-click: a folder's options are on its ⋮. */}
                {e.kind === "folder" && naming?.key !== keyOf(e) && !picker ? (
                  <button
                    type="button"
                    aria-label={`Options for ${e.name}`}
                    onClick={(ev) => {
                      const r = ev.currentTarget.getBoundingClientRect();
                      if (!selected.has(keyOf(e))) selectOnly(keyOf(e));
                      setMenu({ x: r.left, y: r.bottom, entry: e, touch: true });
                    }}
                    className="absolute top-1/2 right-1 z-10 -translate-y-1/2 rounded-full p-2 text-muted active:bg-background sm:hidden"
                  >
                    <Icon d={ICONS.more} className="h-5 w-5" />
                  </button>
                ) : null}
                {naming?.key === keyOf(e) ? (
                  <div className={editingTile}>
                    <span className="flex h-16 items-center">
                      <Glyph entry={e} large shared={sharedFolders.has(e.id) && e.kind === "folder"} />
                    </span>
                    {nameInput(e.kind === "file", "w-full text-center text-xs")}
                  </div>
                ) : (
                  <button
                    type="button"
                    {...itemProps(e)}
                    className={`flex w-full flex-col items-center gap-1.5 text-center ${e.kind === "folder" ? "rounded-xl px-3 py-2.5" : "rounded-none"} sm:rounded-xl sm:p-2 ${itemLook} ${stateClass(e)}`}
                  >
                    <span className="flex w-full sm:hidden">
                      <PhoneTile entry={e} selected={selected.has(keyOf(e)) && (chosen.length > 1 || selecting)} shared={sharedFolders.has(e.id)} />
                    </span>
                    {/* Wider: a picture shows big, square; anything else as its icon. */}
                    {e.kind === "file" && tileOf(e.file) ? (
                      <span className="relative hidden aspect-square w-full overflow-hidden rounded-lg bg-background sm:block">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived storage link */}
                        <img src={tileOf(e.file)!} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
                        {e.file.openComments ? (
                          <span className="absolute right-1.5 bottom-1.5 rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-white shadow-sm">{e.file.openComments}</span>
                        ) : null}
                        {e.file.media?.kind === "photo" && e.file.media.cover ? (
                          <span className="absolute right-1.5 top-1.5 rounded-full bg-surface/90 px-1.5 text-[10px] font-semibold shadow-sm">★ Cover</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="hidden h-16 items-center sm:flex">
                        <Glyph entry={e} large shared={sharedFolders.has(e.id) && e.kind === "folder"} />
                      </span>
                    )}
                    <span className={`hidden w-full text-xs leading-tight break-words sm:block ${selected.has(keyOf(e)) && chosen.length === 1 ? "" : "line-clamp-2"}`}>{e.name}</span>
                    {e.kind === "file" && e.file.caption && !namingTask ? <span className="hidden w-full truncate text-[11px] text-muted sm:block">{e.file.caption}</span> : null}
                  </button>
                )}
                {e.kind === "file" ? captionBox(e.id, "mt-1") : null}
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
                    {e.kind === "file" || picker ? heart(e.id, `absolute top-1/2 -left-1 -translate-y-1/2 ${picker ? "" : "h-6 w-6 text-sm"}`) : null}
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
                          {e.kind === "file" && e.file.caption && !namingTask ? <span className="hidden truncate text-xs text-muted md:inline">{e.file.caption}</span> : null}
                        </span>
                        {cells}
                      </button>
                    )}
                    {e.kind === "file" ? captionBox(e.id, "mt-1 mb-2 ml-12 max-w-sm text-left") : null}
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
      {/* On a phone, adding is the + button's. */}
      {listing.folder && shareable(listing.folder) || canNewFolder || rights.add ? (
        <button
          type="button"
          aria-label="Add or share"
          onClick={() => setAdding(true)}
          disabled={uploading}
          className="fixed right-4 bottom-24 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg active:scale-95 sm:hidden"
        >
          <Icon d={ICONS.plus} className="h-7 w-7" />
        </button>
      ) : null}
      {adding ? (
        <BottomSheet open onClose={() => setAdding(false)} title={listing.folder?.name ?? topLabel}>
          <div className="grid gap-2">
            {rights.add ? (
              <Button className="min-h-12 justify-start" onClick={() => (setAdding(false), pickRef.current?.click())}>
                <Icon d={ICONS.upload} className="h-5 w-5" />
                {mediaFolder ? "Add photos or a video" : "Upload photos or files"}
              </Button>
            ) : null}
            {canNewFolder ? (
              <Button variant="secondary" className="min-h-12 justify-start" onClick={() => (setAdding(false), newFolder())}>
                <Icon d={ICONS.folderPlus} className="h-5 w-5" />
                {bizNew ?? "New folder"}
              </Button>
            ) : null}
            {listing.folder && shareable(listing.folder) ? (
              <Button variant="secondary" className="min-h-12 justify-start" onClick={() => (setAdding(false), setSharingFolder(listing.folder))}>
                <Icon d={ICONS.people} className="h-5 w-5" />
                Share this folder
              </Button>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}

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
            namingTask
              ? (f) => captionBox(f.id, "min-w-56 text-left")
              : choosing
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
          watermark={protect?.watermark}
        />
      ) : null}

      {renaming ? (
        <BatchRename
          items={renaming.entries.map((e) => ({
            kind: e.kind,
            id: e.id,
            name: e.name,
            createdAt: e.kind === "file" ? e.file.createdAt : null,
            caption: e.kind === "file" ? (captions.get(e.id) ?? e.file.caption) : null,
          }))}
          others={[...listing.folders, ...listing.files].filter((x) => !renaming.entries.some((e) => e.id === x.id)).map((x) => x.name)}
          initialPattern={renaming.pattern}
          initialDedupe={renaming.dedupe}
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
          title={menu.entry ? (actOn(menu.entry).length > 1 ? `${chosen.length} selected` : menu.entry.name) : (listing.folder?.name ?? topLabel)}
          entries={menu.entry ? itemMenu(menu.entry, menu.touch ?? false) : backgroundMenu}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {covered ? <ProofCover /> : null}

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
