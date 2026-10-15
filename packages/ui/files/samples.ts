// A sample business drive for the Design Room: nested folders (Projects and
// its project folders, and Business, as they're made for real) and every kind
// of file. The pictures are drawn here; the other files have no content, so
// their links go nowhere.

import { businessTree, type FileView, type Folder, type FolderListing, type FolderShare } from "@repo/lib/files/core";

const folder = (id: string, parentId: string | null, name: string, projectId: string | null = null): Folder => ({ id, parentId, name, projectId, holdsProjects: false });

const FOLDERS: Folder[] = [
  { ...folder("f-projects", null, "Projects"), holdsProjects: true },
  folder("f-nakato", "f-projects", "Nakato & Brian wedding", "p-1"),
  folder("f-amina", "f-projects", "Amina & Joel wedding", "p-2"),
  folder("f-grads", "f-projects", "MUBS graduation shoot", "p-3"),
  folder("f-nakato-raw", "f-nakato", "Raw"),
  folder("f-contracts", null, "Contracts"),
  folder("f-brand", null, "Brand kit"),
  folder("f-invoices", null, "Invoices"),
  folder("f-raw", null, "Raw footage"),
  folder("f-logos", "f-brand", "Logos"),
  // Business: what the sample business sells, as the server builds it.
  ...businessTree(
    [
      {
        id: "cat-weddings",
        kind: "service",
        name: "Weddings",
        services: [
          { id: "svc-wedding", name: "Wedding Photography", fromAming: false },
          { id: "svc-engagement", name: "Engagement shoot", fromAming: false },
        ],
      },
      { id: "cat-portraits", kind: "service", name: "Portraits", services: [{ id: "svc-baby", name: "Baby Shoot", fromAming: false }] },
      { id: "cat-photobooks", kind: "product", name: "Photobooks", services: [{ id: "prd-classic", name: "Classic photobook", fromAming: true }] },
    ],
    new Map([["svc-wedding", "album-wedding"]]),
  ),
];

/** A small landscape: sky, sun and hills in the given colours. */
function picture(sky: string, sun: string, hill: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${sky}"/><circle cx="300" cy="90" r="40" fill="${sun}"/><path d="M0 220 Q100 140 200 210 T400 190 V300 H0Z" fill="${hill}"/><path d="M0 260 Q150 200 400 250 V300 H0Z" fill="${hill}" opacity=".7"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const PICTURES = [
  ["Sunset over the lake", picture("#f9a26c", "#ffe08a", "#7a3b69")],
  ["City at dusk", picture("#3b4a8c", "#f6c177", "#1f2547")],
  ["Ceremony", picture("#bfe3f5", "#fff6c2", "#4f9d69")],
  ["First dance", picture("#f4c4d6", "#fff0f5", "#a0526d")],
  ["Cake", picture("#fde7c8", "#ffffff", "#d08c4a")],
  ["Group photo", picture("#cde7d8", "#fefae0", "#2d6a4f")],
  ["Bride", picture("#e7dcf7", "#fff8e7", "#6b4fa0")],
  ["Garden", picture("#d8f3dc", "#ffd166", "#40916c")],
  ["Night sky", picture("#14213d", "#fca311", "#0b132b")],
] as const;

let n = 0;
function file(folderId: string | null, name: string, bytes: number, contentType: string, createdAt: string, downloadUrl = "#"): FileView {
  const real = downloadUrl !== "#";
  return { id: `file-${++n}`, folderId, name, bytes, contentType, caption: null, createdAt, downloadUrl, previewUrl: real && /^(image|video)\/|pdf$/.test(contentType) ? downloadUrl : null, thumbUrl: real && contentType.startsWith("image/") ? downloadUrl : null };
}
const photo = (folderId: string | null, i: number, createdAt: string) =>
  file(folderId, `${PICTURES[i][0]}.svg`, 240_000 + i * 17_000, "image/svg+xml", createdAt, PICTURES[i][1]);

const MB = 1024 * 1024;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const FILES: FileView[] = [
  file(null, "Price list 2026.pdf", 1.2 * MB, "application/pdf", "2026-10-02T09:12:00Z"),
  file(null, "Studio budget.xlsx", 84_000, XLSX, "2026-09-28T14:40:00Z"),
  file(null, "Client pitch.pptx", 18 * MB, "application/vnd.openxmlformats-officedocument.presentationml.presentation", "2026-09-20T11:05:00Z"),
  photo(null, 0, "2026-10-10T16:22:00Z"),
  photo(null, 1, "2026-10-11T08:03:00Z"),
  file(null, "Promo reel.mp4", 412 * MB, "video/mp4", "2026-09-15T18:30:00Z"),
  file(null, "Wedding package terms.docx", 46_000, DOCX, "2026-08-30T10:00:00Z"),
  file(null, "Archive Aug.zip", 860 * MB, "application/zip", "2026-09-01T07:45:00Z"),
  file(null, "Voice note.m4a", 3.4 * MB, "audio/mp4", "2026-10-12T12:10:00Z"),
  file(null, "Notes", 2_000, "application/octet-stream", "2026-10-13T09:00:00Z"),
  file("f-contracts", "Nakato & Brian, signed.pdf", 620_000, "application/pdf", "2026-07-14T10:20:00Z"),
  file("f-contracts", "Amina & Joel, signed.pdf", 590_000, "application/pdf", "2026-08-02T15:00:00Z"),
  file("f-contracts", "Contract template.docx", 38_000, DOCX, "2026-06-01T09:00:00Z"),
  file("f-nakato", "Shot list.pdf", 210_000, "application/pdf", "2026-07-01T09:00:00Z"),
  file("f-nakato", "Highlights.mov", 920 * MB, "video/quicktime", "2026-08-20T20:00:00Z"),
  ...[2, 3, 4, 5].map((i) => photo("f-nakato", i, `2026-08-1${i}T14:00:00Z`)),
  ...[6, 7].map((i) => photo("f-amina", i, `2026-09-0${i}T13:00:00Z`)),
  file("f-grads", "Group list.xlsx", 31_000, XLSX, "2026-10-09T09:00:00Z"),
  file("f-brand", "Colours and fonts.pdf", 1.8 * MB, "application/pdf", "2026-05-10T10:00:00Z"),
  file("f-brand", "Poster.psd", 96 * MB, "image/vnd.adobe.photoshop", "2026-05-12T10:00:00Z"),
  file("f-logos", "Logo.ai", 4.2 * MB, "application/postscript", "2026-05-09T10:00:00Z"),
  photo("f-logos", 8, "2026-05-09T10:05:00Z"),
  // Wedding Photography's media: its photos (the first is the cover) and preview video.
  ...[0, 3, 5, 6].map((p, i): FileView => ({
    ...photo("business-item-svc-wedding", p, "2026-09-01T10:00:00Z"),
    name: `Photo ${String(i + 1).padStart(2, "0")}.jpg`,
    contentType: "image/jpeg",
    createdAt: null,
    media: { kind: "photo", albumId: "album-wedding", cover: i === 0 },
  })),
  { ...file("business-item-svc-wedding", "Preview video", 48 * MB, "video/mp4", "2026-09-01T10:00:00Z"), createdAt: null, media: { kind: "video", albumId: "album-wedding" } },
  file("f-invoices", "September.csv", 22_000, "text/csv", "2026-10-01T08:00:00Z"),
  file("f-invoices", "August.csv", 19_000, "text/csv", "2026-09-01T08:00:00Z"),
];

/** One folder of the sample drive, as the server would list it; null when there's no such folder. */
export function sampleListing(folderId: string | null): FolderListing | null {
  const here = folderId ? FOLDERS.find((f) => f.id === folderId) : null;
  if (here === undefined) return null;
  const path: Folder[] = [];
  for (let at = here; at; at = FOLDERS.find((f) => f.id === at!.parentId) ?? null) path.unshift(at);
  const id = here?.id ?? null;
  return {
    folder: here,
    path,
    folders: FOLDERS.filter((f) => f.parentId === id),
    files: FILES.filter((f) => f.folderId === id),
    allFolders: FOLDERS,
    // Business folders show; a service's takes photos and a video.
    rights: here?.business ? { add: here.business.kind === "item", change: false, download: true, share: false } : { add: true, change: true, download: true, share: true },
    addable: { top: true, folders: FOLDERS.filter((f) => !f.business).map((f) => f.id) },
  };
}

/** Who the sample folders are shared with: Nakato's wedding with her and by link, Contracts with an editor on the team. */
export const SAMPLE_SHARES: FolderShare[] = [
  { id: "s-1", folderId: "f-nakato", audience: { kind: "client", customerId: "c-1", name: "Nakato Sarah" }, role: "contributor", canDownload: true, createdAt: "2026-10-01T09:00:00Z" },
  { id: "s-2", folderId: "f-nakato", audience: { kind: "link", token: "sample-link-0000000000000000000000000", expiresOn: "2026-12-31" }, role: "viewer", canDownload: true, createdAt: "2026-10-02T09:00:00Z" },
  { id: "s-3", folderId: "f-contracts", audience: { kind: "member", memberId: "m-1", name: "Joel (editor)" }, role: "viewer", canDownload: false, createdAt: "2026-10-03T09:00:00Z" },
];

export const SAMPLE_PEOPLE = {
  clients: [
    { id: "c-1", name: "Nakato Sarah" },
    { id: "c-2", name: "Amina Joel" },
    { id: "c-3", name: "MUBS Class of 2026" },
  ],
  members: [
    { id: "m-1", name: "Joel (editor)" },
    { id: "m-2", name: "Grace (second shooter)" },
  ],
};
