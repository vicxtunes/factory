import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { FileAccess, FileComment, Folder, FolderShare, StoredFile } from "./core";
import { FileError, type FileRepository, type ObjectStore } from "./ports";
import { FileService } from "./service";

// The service against an in-memory object store (key → size) and repository
// that keep studios apart and check the allowance and names the way the
// database does.

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");
const MB = 1024 ** 2;

function fakes(quotaBytes = 10 * MB) {
  const objects = new Map<string, number>();
  const folders: (Folder & { tenantId: string })[] = [];
  const files: (StoredFile & { tenantId: string })[] = [];
  const shares: (FolderShare & { tenantId: string })[] = [];
  const comments: (FileComment & { tenantId: string })[] = [];
  /** "choose" tasks as the database sees them: their most, and whether they're done. */
  const choosing = new Map<string, { tenantId: string; max: number; done: boolean; picks: string[] }>();
  let n = 0;
  const store: ObjectStore = {
    putUrl: async (key, type) => `put://${key}?type=${type}`,
    getUrl: async (key, _expires, name) => `get://${key}?as=${name}`,
    size: async (key) => objects.get(key) ?? null,
    move: async (from, to) => {
      objects.set(to, objects.get(from)!);
      objects.delete(from);
    },
    remove: async (keys) => keys.forEach((k) => objects.delete(k)),
    read: async (key) => (objects.has(key) ? new Uint8Array(objects.get(key)!) : null),
    write: async (key, body) => void objects.set(key, body.byteLength),
  };
  /** Small copies: a preview a tenth of the original, a thumbnail a hundredth (failing for a "broken" one). */
  const previewer = {
    make: async (original: Uint8Array) => {
      if (original.byteLength === 13) throw new Error("not a picture sharp can read");
      return { preview: new Uint8Array(Math.ceil(original.byteLength / 10)), thumb: new Uint8Array(Math.ceil(original.byteLength / 100)) };
    },
  };
  // What the database counts: each file and its small copies.
  const used = (t: string) => files.filter((f) => f.tenantId === t).reduce((s, f) => s + f.bytes + f.previewBytes, 0);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const folderTaken = (t: string, parentId: string | null, name: string, except?: string) =>
    folders.some((f) => f.tenantId === t && f.parentId === parentId && same(f.name, name) && f.id !== except);
  const fileTaken = (t: string, folderId: string | null, name: string, except?: string) =>
    files.some((f) => f.tenantId === t && f.folderId === folderId && same(f.name, name) && f.id !== except);
  const repo: FileRepository = {
    usage: async (s) => ({ usedBytes: used(s.tenantId), quotaBytes }),
    folders: async (s) => folders.filter((f) => f.tenantId === s.tenantId).map(({ id, parentId, name, projectId, holdsProjects }) => ({ id, parentId, name, projectId, holdsProjects })),
    createFolder: async (s, f) => {
      if (folderTaken(s.tenantId, f.parentId, f.name)) throw new FileError("There's already a folder with that name here.");
      folders.push({ ...f, id: `d${folders.length + 1}`, projectId: null, holdsProjects: false, tenantId: s.tenantId });
      return `d${folders.length}`;
    },
    updateFolder: async (s, id, f) => {
      const folder = folders.find((x) => x.tenantId === s.tenantId && x.id === id && !x.projectId && !x.holdsProjects);
      if (!folder) return false;
      if (folderTaken(s.tenantId, f.parentId, f.name, id)) throw new FileError("There's already a folder with that name here.");
      Object.assign(folder, f);
      return true;
    },
    deleteFolder: async (s, id) => {
      if (!folders.some((f) => f.tenantId === s.tenantId && f.id === id)) return null;
      const tree = new Set([id]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const f of folders) if (f.parentId && tree.has(f.parentId) && !tree.has(f.id)) grew = !!tree.add(f.id);
      }
      const keys = files.filter((f) => f.folderId && tree.has(f.folderId)).map((f) => f.key);
      for (let i = files.length - 1; i >= 0; i--) if (keys.includes(files[i].key)) files.splice(i, 1);
      for (let i = folders.length - 1; i >= 0; i--) if (tree.has(folders[i].id)) folders.splice(i, 1);
      return keys;
    },
    files: async (s, folderId) => files.filter((f) => f.tenantId === s.tenantId && f.folderId === folderId),
    file: async (s, id) => files.find((f) => f.tenantId === s.tenantId && f.id === id) ?? null,
    record: async (s, f) => {
      if (used(s.tenantId) + f.bytes > quotaBytes) throw new FileError("Not enough space left for that.");
      if (fileTaken(s.tenantId, f.folderId, f.name)) throw new FileError("There's already a file with that name here.");
      files.push({ ...f, caption: null, previewBytes: 0, tenantId: s.tenantId, createdAt: "2026-10-13T00:00:00Z" });
    },
    updateFile: async (s, id, f) => {
      const file = files.find((x) => x.tenantId === s.tenantId && x.id === id);
      if (!file) return false;
      if (fileTaken(s.tenantId, f.folderId, f.name, id)) throw new FileError("There's already a file with that name here.");
      Object.assign(file, f);
      return true;
    },
    deleteFile: async (s, id) => {
      const i = files.findIndex((f) => f.tenantId === s.tenantId && f.id === id);
      return i < 0 ? null : files.splice(i, 1)[0].key;
    },
    shares: async (s) => shares.filter((x) => x.tenantId === s.tenantId),
    createShare: async (s, { folderId, target, settings }) => {
      const id = `s${shares.length + 1}`;
      const audience =
        target.kind === "link"
          ? { kind: "link" as const, token: target.token, expiresOn: settings.expiresOn }
          : target.kind === "client"
            ? { kind: "client" as const, customerId: target.customerId, name: "A client" }
            : { kind: "member" as const, memberId: target.memberId, name: "A member" };
      shares.push({ id, folderId, audience, role: settings.role, canDownload: settings.canDownload, createdAt: "2026-10-15T00:00:00Z", tenantId: s.tenantId });
      return id;
    },
    updateShare: async (s, id, settings) => {
      const share = shares.find((x) => x.tenantId === s.tenantId && x.id === id);
      if (!share) return false;
      Object.assign(share, { role: settings.role, canDownload: settings.canDownload });
      if (share.audience.kind === "link") share.audience = { ...share.audience, expiresOn: settings.expiresOn };
      return true;
    },
    deleteShare: async (s, id) => {
      const i = shares.findIndex((x) => x.tenantId === s.tenantId && x.id === id);
      return i >= 0 && shares.splice(i, 1).length > 0;
    },
    setPreviewBytes: async (s, id, bytes) => {
      const file = files.find((f) => f.tenantId === s.tenantId && f.id === id);
      if (file) file.previewBytes = bytes;
      return !!file;
    },
    needingPreviews: async (s, folderIds) => files.filter((f) => f.tenantId === s.tenantId && folderIds.includes(f.folderId!) && f.previewBytes === 0 && f.contentType.startsWith("image/")),
    setCaption: async (s, id, caption) => {
      const file = files.find((f) => f.tenantId === s.tenantId && f.id === id);
      if (file) file.caption = caption;
      return !!file;
    },
    renameMany: async (s, batch) => {
      const fs = batch.folders.map((x) => ({ x, f: folders.find((f) => f.tenantId === s.tenantId && f.id === x.id && !f.projectId && !f.holdsProjects) }));
      const ls = batch.files.map((x) => ({ x, f: files.find((f) => f.tenantId === s.tenantId && f.id === x.id) }));
      if (fs.some(({ f }) => !f)) throw new FileError("A folder you chose is gone or can't be renamed.");
      if (ls.some(({ f }) => !f)) throw new FileError("A file you chose is gone.");
      fs.forEach(({ x, f }) => (f!.name = x.name));
      ls.forEach(({ x, f }) => (f!.name = x.name));
    },
    comments: async (s, fileId) => comments.filter((c) => c.tenantId === s.tenantId && c.fileId === fileId),
    openCommentCounts: async (s, ids) => {
      const counts = new Map<string, number>();
      for (const c of comments) if (c.tenantId === s.tenantId && ids.includes(c.fileId) && !c.resolvedAt) counts.set(c.fileId, (counts.get(c.fileId) ?? 0) + 1);
      return counts;
    },
    addComment: async (s, c) => {
      if (!files.some((f) => f.tenantId === s.tenantId && f.id === c.fileId)) throw new FileError("That file no longer exists.");
      const comment = { ...c, id: `k${comments.length + 1}`, createdAt: "2026-10-15T00:00:00Z", resolvedAt: null, tenantId: s.tenantId };
      comments.push(comment);
      return comment;
    },
    commentFile: async (s, id) => comments.find((c) => c.tenantId === s.tenantId && c.id === id)?.fileId ?? null,
    setCommentResolved: async (s, id, resolved) => {
      const c = comments.find((x) => x.tenantId === s.tenantId && x.id === id);
      if (c) c.resolvedAt = resolved ? "2026-10-15T01:00:00Z" : null;
      return !!c;
    },
    deleteComment: async (s, id) => {
      const i = comments.findIndex((x) => x.tenantId === s.tenantId && x.id === id);
      return i >= 0 && comments.splice(i, 1).length > 0;
    },
    pick: async (s, taskId, fileId, picked) => {
      const task = choosing.get(taskId);
      if (!task || task.tenantId !== s.tenantId) throw new FileError("That task is gone, or isn't for choosing.");
      if (task.done) throw new FileError("Your choice is already sent.");
      if (picked && !task.picks.includes(fileId)) {
        if (task.picks.length >= task.max) throw new FileError("You've chosen as many as you can.");
        task.picks.push(fileId);
      }
      if (!picked) task.picks = task.picks.filter((f) => f !== fileId);
      return task.picks.length;
    },
    picks: async (s, taskId) => (choosing.get(taskId)?.tenantId === s.tenantId ? [...choosing.get(taskId)!.picks] : []),
    shareByToken: async (token) => {
      const share = shares.find((x) => x.audience.kind === "link" && x.audience.token === token);
      return share ? { tenantId: share.tenantId, share } : null;
    },
  };
  const service = new FileService(repo, store, () => `f${++n}`, () => `token-${++n}`, previewer);
  /** Uploads one file the way the browser does: ask, PUT (here: set its real size), confirm. */
  async function upload(s: TenantScope, folderId: string | null, name: string, bytes: number, claimed = bytes, access?: FileAccess, contentType = "application/pdf") {
    const [ticket] = await service.startUpload(s, folderId, [{ name, bytes: claimed, contentType }], access);
    objects.set(`incoming/${s.tenantId}/file-${ticket.fileId}`, bytes);
    await service.confirmUpload(s, { folderId, fileId: ticket.fileId, name, contentType }, access);
    return ticket.fileId;
  }
  return { service, objects, files, folders, upload, choosing };
}

const says = (pattern: RegExp) => (err: unknown) => err instanceof FileError && pattern.test(err.message);

test("an uploaded file is checked, moved into place and listed with a download link", async () => {
  const { service, objects, upload } = fakes();
  const id = await upload(studioA, null, "contract.pdf", 2 * MB);
  assert.deepEqual([...objects.keys()], [`studios/studio-a/files/${id}`]);
  const listing = await service.list(studioA, null);
  assert.equal(listing?.files.length, 1);
  assert.equal(listing?.files[0].name, "contract.pdf");
  assert.equal(listing?.files[0].bytes, 2 * MB);
  assert.equal(listing?.files[0].downloadUrl, `get://studios/studio-a/files/${id}?as=contract.pdf`);
  assert.deepEqual(await service.usage(studioA), { usedBytes: 2 * MB, quotaBytes: 10 * MB });
});

test("an upload that doesn't fit is refused before anything is sent", async () => {
  const { service } = fakes(5 * MB);
  await assert.rejects(service.startUpload(studioA, null, [{ name: "big.zip", bytes: 6 * MB, contentType: "application/zip" }]), says(/Not enough space/));
});

test("the real size counts, not what the browser said: an oversized file is deleted", async () => {
  const { objects, upload, files } = fakes(5 * MB);
  await assert.rejects(upload(studioA, null, "big.zip", 6 * MB, 1 * MB), says(/Not enough space/));
  assert.equal(objects.size, 0);
  assert.equal(files.length, 0);
});

test("an upload that never arrived, or arrived empty, isn't recorded", async () => {
  const { service, objects } = fakes();
  const [ticket] = await service.startUpload(studioA, null, [{ name: "a.pdf", bytes: 10, contentType: "application/pdf" }]);
  const confirm = () => service.confirmUpload(studioA, { folderId: null, fileId: ticket.fileId, name: "a.pdf", contentType: "application/pdf" });
  await assert.rejects(confirm(), says(/didn't finish/));
  objects.set(`incoming/studio-a/file-${ticket.fileId}`, 0);
  await assert.rejects(confirm(), says(/empty/));
  assert.equal(objects.size, 0);
});

test("a name already there gets a number", async () => {
  const { service, upload } = fakes();
  await upload(studioA, null, "report.pdf", MB);
  await upload(studioA, null, "Report.pdf", MB);
  assert.deepEqual((await service.list(studioA, null))?.files.map((f) => f.name), ["Report (2).pdf", "report.pdf"]);
});

test("folders nest, list by name and show the way back up", async () => {
  const { service, upload } = fakes();
  const clients = await service.createFolder(studioA, { parentId: null, name: "Clients" });
  const weddings = await service.createFolder(studioA, { parentId: clients, name: "Weddings" });
  await service.createFolder(studioA, { parentId: clients, name: "Graduations" });
  await upload(studioA, weddings, "list.pdf", MB);
  const top = await service.list(studioA, null);
  assert.deepEqual(top?.folders.map((f) => f.name), ["Clients"]);
  const inside = await service.list(studioA, clients);
  assert.deepEqual(inside?.folders.map((f) => f.name), ["Graduations", "Weddings"]);
  const deep = await service.list(studioA, weddings);
  assert.deepEqual(deep?.path.map((f) => f.name), ["Clients", "Weddings"]);
  assert.deepEqual(deep?.files.map((f) => f.name), ["list.pdf"]);
  await assert.rejects(service.createFolder(studioA, { parentId: clients, name: "weddings" }), says(/already a folder/));
  assert.equal(await service.list(studioA, "gone"), null);
});

test("files and folders rename and move; a folder never goes into itself", async () => {
  const { service, upload } = fakes();
  const a = await service.createFolder(studioA, { parentId: null, name: "A" });
  const b = await service.createFolder(studioA, { parentId: a, name: "B" });
  const file = await upload(studioA, null, "x.pdf", MB);
  await service.renameFile(studioA, file, "y.pdf");
  await service.moveFile(studioA, file, b);
  assert.deepEqual((await service.list(studioA, b))?.files.map((f) => f.name), ["y.pdf"]);
  await service.renameFolder(studioA, b, "Bee");
  await assert.rejects(service.moveFolder(studioA, a, b), says(/into itself/));
  await assert.rejects(service.moveFolder(studioA, a, a), says(/into itself/));
  await service.moveFolder(studioA, b, null);
  assert.deepEqual((await service.list(studioA, null))?.folders.map((f) => f.name), ["A", "Bee"]);
  await assert.rejects(service.moveFile(studioA, file, "gone"), says(/folder no longer exists/));
});

test("deleting frees the space: a file, or a folder with everything in it", async () => {
  const { service, objects, upload } = fakes();
  const a = await service.createFolder(studioA, { parentId: null, name: "A" });
  const b = await service.createFolder(studioA, { parentId: a, name: "B" });
  await upload(studioA, a, "one.pdf", MB);
  await upload(studioA, b, "two.pdf", MB);
  const loose = await upload(studioA, null, "three.pdf", MB);
  await service.deleteFolder(studioA, a);
  assert.equal(objects.size, 1);
  assert.equal((await service.usage(studioA)).usedBytes, MB);
  await service.deleteFile(studioA, loose);
  assert.equal(objects.size, 0);
  await assert.rejects(service.deleteFile(studioA, loose), says(/file no longer exists/));
  await assert.rejects(service.deleteFolder(studioA, a), says(/folder no longer exists/));
});

test("one studio never reaches another's folders or files", async () => {
  const { service, upload } = fakes();
  const folder = await service.createFolder(studioA, { parentId: null, name: "Private" });
  const file = await upload(studioA, folder, "secret.pdf", MB);
  assert.equal(await service.list(studioB, folder), null);
  assert.deepEqual((await service.list(studioB, null))?.allFolders, []);
  await assert.rejects(service.startUpload(studioB, folder, [{ name: "a", bytes: 1, contentType: "text/plain" }]), says(/folder no longer exists/));
  await assert.rejects(service.renameFile(studioB, file, "mine.pdf"), says(/file no longer exists/));
  await assert.rejects(service.moveFile(studioB, file, null), says(/file no longer exists/));
  await assert.rejects(service.deleteFile(studioB, file), says(/file no longer exists/));
  await assert.rejects(service.deleteFolder(studioB, folder), says(/folder no longer exists/));
  await assert.rejects(service.createFolder(studioB, { parentId: folder, name: "In" }), says(/folder no longer exists/));
});

test("a project's folder, and the Projects folder holding it, are filled but never renamed, moved or deleted", async () => {
  const { service, folders, upload } = fakes();
  // As the database makes them with a project.
  folders.push({ id: "projects", parentId: null, name: "Projects", projectId: null, holdsProjects: true, tenantId: "studio-a" });
  folders.push({ id: "wedding", parentId: "projects", name: "Nakato wedding", projectId: "p1", holdsProjects: false, tenantId: "studio-a" });
  assert.equal(await service.projectFolder(studioA, "p1"), "wedding");
  assert.equal(await service.projectFolder(studioA, "p2"), null);
  assert.equal(await service.projectFolder(studioB, "p1"), null);

  await upload(studioA, "wedding", "contract.pdf", MB);
  const raw = await service.createFolder(studioA, { parentId: "wedding", name: "Raw" });
  assert.deepEqual((await service.list(studioA, "wedding"))?.files.map((f) => f.name), ["contract.pdf"]);
  await service.renameFolder(studioA, raw, "Raw footage");

  await assert.rejects(service.renameFolder(studioA, "wedding", "Mine"), says(/Rename the project/));
  await assert.rejects(service.moveFolder(studioA, "wedding", null), says(/Rename the project/));
  await assert.rejects(service.deleteFolder(studioA, "wedding"), says(/Rename the project/));
  await assert.rejects(service.renameFolder(studioA, "projects", "Jobs"), says(/holds every project's folder/));
  await assert.rejects(service.moveFolder(studioA, "projects", raw), says(/holds every project's folder/));
  await assert.rejects(service.deleteFolder(studioA, "projects"), says(/holds every project's folder/));
  assert.deepEqual((await service.list(studioA, "projects"))?.folders.map((f) => f.name), ["Nakato wedding"]);
});

// ── Sharing ────────────────────────────────────────────────────────────────

/** Clients / Nakato (shared) / Raw, and Clients / Amina (not), with a file in each. */
async function sharedDrive() {
  const f = fakes();
  const { service, upload } = f;
  const clients = await service.createFolder(studioA, { parentId: null, name: "Clients" });
  const nakato = await service.createFolder(studioA, { parentId: clients, name: "Nakato" });
  const raw = await service.createFolder(studioA, { parentId: nakato, name: "Raw" });
  const amina = await service.createFolder(studioA, { parentId: clients, name: "Amina" });
  const contract = await upload(studioA, nakato, "contract.pdf", MB);
  const clip = await upload(studioA, raw, "clip.pdf", MB);
  const secret = await upload(studioA, amina, "secret.pdf", MB);
  return { ...f, clients, nakato, raw, amina, contract, clip, secret };
}

const settings = (role: "viewer" | "contributor" | "editor", canDownload = true, expiresOn: string | null = null) => ({ role, canDownload, expiresOn });

test("a shared folder is all a client sees: it's their top, the way up stops there, nothing beside it shows", async () => {
  const { service, clients, nakato, raw, amina } = await sharedDrive();
  await service.share(studioA, nakato, { kind: "client", customerId: "c1" }, settings("viewer"));
  const access = await service.clientAccess(studioA, "c1");

  const top = await service.list(studioA, null, access);
  assert.deepEqual(top?.folders.map((f) => f.name), ["Nakato"]);
  assert.deepEqual(top?.files, []);
  assert.deepEqual(top?.allFolders.map((f) => f.name), ["Nakato", "Raw"]);
  const deep = await service.list(studioA, raw, access);
  assert.deepEqual(deep?.path.map((f) => f.name), ["Nakato", "Raw"]);
  assert.deepEqual(deep?.files.map((f) => f.name), ["clip.pdf"]);
  assert.equal(await service.list(studioA, clients, access), null);
  assert.equal(await service.list(studioA, amina, access), null);
  // Someone else's shares give them nothing.
  assert.deepEqual((await service.list(studioA, null, await service.clientAccess(studioA, "c2")))?.folders, []);
  assert.equal(await service.list(studioA, nakato, await service.clientAccess(studioA, "c2")), null);
});

test("a viewer looks (downloading only if allowed), and changes nothing", async () => {
  const { service, upload, nakato, contract } = await sharedDrive();
  await service.share(studioA, nakato, { kind: "member", memberId: "m1" }, settings("viewer", false));
  const access = await service.memberAccess(studioA, "m1");
  const here = await service.list(studioA, nakato, access);
  assert.deepEqual(here?.rights, { add: false, change: false, download: false, share: false });
  assert.equal(here?.files[0].downloadUrl, null);
  // Still shown (a PDF, a picture): looking isn't keeping.
  assert.ok(here?.files[0].previewUrl);
  await assert.rejects(upload(studioA, nakato, "mine.pdf", MB, MB, access), says(/can't add/));
  await assert.rejects(service.createFolder(studioA, { parentId: nakato, name: "Mine" }, access), says(/can't add/));
  await assert.rejects(service.renameFile(studioA, contract, "x.pdf", access), says(/can't rename, move or delete/));
  await assert.rejects(service.deleteFile(studioA, contract, access), says(/can't rename, move or delete/));
});

test("a contributor adds files and folders, but doesn't change what's there", async () => {
  const { service, upload, nakato, contract } = await sharedDrive();
  await service.share(studioA, nakato, { kind: "client", customerId: "c1" }, settings("contributor"));
  const access = await service.clientAccess(studioA, "c1");
  await upload(studioA, nakato, "brief.pdf", MB, MB, access);
  await service.createFolder(studioA, { parentId: nakato, name: "Ideas" }, access);
  const here = await service.list(studioA, nakato, access);
  assert.deepEqual(here?.files.map((f) => f.name), ["brief.pdf", "contract.pdf"]);
  assert.ok(here?.files[0].downloadUrl);
  await assert.rejects(service.deleteFile(studioA, contract, access), says(/can't rename, move or delete/));
  // Their uploads use the business's storage.
  assert.equal((await service.usage(studioA)).usedBytes, 4 * MB);
});

test("an editor changes what's inside, but not the shared folder itself, and nothing outside it", async () => {
  const { service, clients, nakato, raw, amina, contract, clip, secret } = await sharedDrive();
  await service.share(studioA, nakato, { kind: "member", memberId: "m1" }, settings("editor"));
  const access = await service.memberAccess(studioA, "m1");
  await service.renameFile(studioA, contract, "signed.pdf", access);
  await service.moveFile(studioA, clip, nakato, access);
  await service.renameFolder(studioA, raw, "Footage", access);
  await service.deleteFolder(studioA, raw, access);
  assert.deepEqual((await service.list(studioA, nakato, access))?.files.map((f) => f.name), ["clip.pdf", "signed.pdf"]);

  await assert.rejects(service.renameFolder(studioA, nakato, "Mine", access), says(/can't rename, move or delete/));
  await assert.rejects(service.deleteFolder(studioA, nakato, access), says(/can't rename, move or delete/));
  await assert.rejects(service.moveFile(studioA, clip, clients, access), says(/folder no longer exists/));
  await assert.rejects(service.moveFile(studioA, clip, null, access), says(/folder no longer exists/));
  await assert.rejects(service.renameFile(studioA, secret, "mine.pdf", access), says(/file no longer exists/));
  await assert.rejects(service.deleteFolder(studioA, amina, access), says(/folder no longer exists/));
});

test("the best of overlapping shares counts, inside the folder shared more", async () => {
  const { service, upload, nakato, raw } = await sharedDrive();
  await service.share(studioA, nakato, { kind: "member", memberId: "m1" }, settings("viewer", false));
  await service.share(studioA, raw, { kind: "member", memberId: "m1" }, settings("contributor"));
  const access = await service.memberAccess(studioA, "m1");
  assert.deepEqual((await service.list(studioA, null, access))?.folders.map((f) => f.name), ["Nakato"]);
  assert.deepEqual((await service.list(studioA, raw, access))?.rights, { add: true, change: false, download: true, share: false });
  assert.deepEqual((await service.list(studioA, nakato, access))?.rights, { add: false, change: false, download: false, share: false });
  await upload(studioA, raw, "more.pdf", MB, MB, access);
  await assert.rejects(upload(studioA, nakato, "more.pdf", MB, MB, access), says(/can't add/));
});

test("a share link opens its folder at its studio only, until its last day, and stops when the share does", async () => {
  const { service, nakato } = await sharedDrive();
  const id = await service.share(studioA, nakato, { kind: "link" }, settings("viewer", true, "2026-10-20"));
  const token = (await service.shares(studioA)).find((s) => s.id === id)!.audience;
  assert.equal(token.kind, "link");
  const secret = token.kind === "link" ? token.token : "";
  const access = await service.linkAccess(studioA, secret, "2026-10-20");
  assert.deepEqual((await service.list(studioA, null, access!))?.folders.map((f) => f.name), ["Nakato"]);
  assert.equal(await service.linkAccess(studioA, secret, "2026-10-21"), null);
  assert.equal(await service.linkAccess(studioB, secret, "2026-10-20"), null);
  assert.equal(await service.linkAccess(studioA, "wrong", "2026-10-20"), null);
  await service.updateShare(studioA, id, settings("viewer", true, null));
  assert.ok(await service.linkAccess(studioA, secret, "2030-01-01"));
  await service.stopSharing(studioA, id);
  assert.equal(await service.linkAccess(studioA, secret, "2026-10-20"), null);
});

test("only a link ends on a day; another studio can't change or stop a share", async () => {
  const { service, nakato } = await sharedDrive();
  const id = await service.share(studioA, nakato, { kind: "client", customerId: "c1" }, settings("editor", true, "2026-10-20"));
  assert.deepEqual((await service.shares(studioA))[0].audience, { kind: "client", customerId: "c1", name: "A client" });
  await assert.rejects(service.updateShare(studioB, id, settings("viewer")), says(/share no longer exists/));
  await assert.rejects(service.stopSharing(studioB, id), says(/share no longer exists/));
  await assert.rejects(service.share(studioB, nakato, { kind: "link" }, settings("viewer")), says(/folder no longer exists/));
  assert.deepEqual(await service.shares(studioB), []);
});

// ── Renaming many ──────────────────────────────────────────────────────────

test("many renamed at once: names can swap, clashes and locked folders are refused, nothing half done", async () => {
  const { service, folders, upload } = fakes();
  const a = await upload(studioA, null, "a.pdf", MB);
  const b = await upload(studioA, null, "b.pdf", MB);
  const c = await upload(studioA, null, "c.pdf", MB);
  const raw = await service.createFolder(studioA, { parentId: null, name: "Raw" });
  await service.renameMany(studioA, null, [
    { kind: "file", id: a, name: "b.pdf" },
    { kind: "file", id: b, name: "a.pdf" },
    { kind: "folder", id: raw, name: "  Raw / 2026 " },
  ]);
  const names = async () => (await service.list(studioA, null))!;
  assert.deepEqual((await names()).files.map((f) => [f.id, f.name]), [[b, "a.pdf"], [a, "b.pdf"], [c, "c.pdf"]]);
  assert.deepEqual((await names()).folders.map((f) => f.name), ["Raw 2026"]);

  await assert.rejects(service.renameMany(studioA, null, [{ kind: "file", id: a, name: "C.pdf" }]), says(/Two files would have the same name/));
  await assert.rejects(service.renameMany(studioA, null, [{ kind: "file", id: a, name: " / " }]), says(/needs a name/));
  folders.push({ id: "projects", parentId: null, name: "Projects", projectId: null, holdsProjects: true, tenantId: "studio-a" });
  await assert.rejects(service.renameMany(studioA, null, [{ kind: "folder", id: "projects", name: "Jobs" }]), says(/holds every project's folder/));
  // Something from another folder (or another studio) isn't here.
  const inside = await upload(studioA, raw, "x.pdf", MB);
  await assert.rejects(service.renameMany(studioA, null, [{ kind: "file", id: inside, name: "y.pdf" }]), says(/file no longer exists/));
  await assert.rejects(service.renameMany(studioB, null, [{ kind: "file", id: a, name: "z.pdf" }]), says(/file no longer exists/));
  assert.deepEqual((await names()).files.map((f) => f.name), ["a.pdf", "b.pdf", "c.pdf"]);
});

test("renaming many needs edit rights where they are", async () => {
  const { service, upload, nakato, contract } = await sharedDrive();
  await service.share(studioA, nakato, { kind: "client", customerId: "c1" }, settings("contributor"));
  await assert.rejects(service.renameMany(studioA, nakato, [{ kind: "file", id: contract, name: "x.pdf" }], await service.clientAccess(studioA, "c1")), says(/can't rename/));
  await service.share(studioA, nakato, { kind: "member", memberId: "m1" }, settings("editor"));
  const editor = await service.memberAccess(studioA, "m1");
  const other = await upload(studioA, nakato, "brief.pdf", MB);
  await service.renameMany(studioA, nakato, [{ kind: "file", id: contract, name: "Nakato-01.pdf" }, { kind: "file", id: other, name: "Nakato-02.pdf" }], editor);
  assert.deepEqual((await service.list(studioA, nakato, editor))?.files.map((f) => f.name), ["Nakato-01.pdf", "Nakato-02.pdf"]);
});

// ── Comments ───────────────────────────────────────────────────────────────

test("whoever can see a file comments on it (pinned or not); open ones are counted on the file", async () => {
  const { service, nakato, contract, secret } = await sharedDrive();
  await service.share(studioA, nakato, { kind: "client", customerId: "c1" }, settings("viewer"));
  const client = await service.clientAccess(studioA, "c1");
  const pinned = await service.comment(studioA, contract, { body: "Remove the pole", pin: { x: 0.4, y: 0.7 } }, { kind: "client", name: "Nakato" }, client);
  await service.comment(studioA, contract, { body: "Done, see v2", pin: null }, { kind: "studio", name: "Grace" });
  assert.deepEqual(
    (await service.comments(studioA, contract, client)).map((c) => [c.author.name, c.body, c.pin]),
    [
      ["Nakato", "Remove the pole", { x: 0.4, y: 0.7 }],
      ["Grace", "Done, see v2", null],
    ],
  );
  assert.equal((await service.list(studioA, nakato, client))?.files.find((f) => f.id === contract)?.openComments, 2);

  // A viewer can't resolve; the business can, and the count follows.
  await assert.rejects(service.resolveComment(studioA, pinned.id, true, client), says(/can't rename, move or delete/));
  await service.resolveComment(studioA, pinned.id, true);
  assert.equal((await service.list(studioA, nakato))?.files.find((f) => f.id === contract)?.openComments, 1);

  // Nothing they can't see, and nothing in another studio.
  await assert.rejects(service.comment(studioA, secret, { body: "hi", pin: null }, { kind: "client", name: "Nakato" }, client), says(/file no longer exists/));
  await assert.rejects(service.comments(studioA, secret, client), says(/file no longer exists/));
  await assert.rejects(service.comments(studioB, contract), says(/file no longer exists/));
  await assert.rejects(service.resolveComment(studioB, pinned.id, false), says(/comment no longer exists/));
});

test("only the business deletes a comment", async () => {
  const { service, nakato, contract } = await sharedDrive();
  await service.share(studioA, nakato, { kind: "member", memberId: "m1" }, settings("editor"));
  const editor = await service.memberAccess(studioA, "m1");
  const c = await service.comment(studioA, contract, { body: "x", pin: null }, { kind: "member", name: "Joel" }, editor);
  await service.resolveComment(studioA, c.id, true, editor);
  await assert.rejects(service.deleteComment(studioA, c.id, editor), says(/Only the business/));
  await service.deleteComment(studioA, c.id);
  assert.deepEqual(await service.comments(studioA, contract), []);
});

// ── Choosing ───────────────────────────────────────────────────────────────

test("a client picks from their task's folder only, up to its most", async () => {
  const { service, upload, choosing, nakato, raw, contract, clip, secret } = await sharedDrive();
  await service.ensureShared(studioA, nakato, { kind: "client", customerId: "c1" }, "viewer");
  const client = await service.clientAccess(studioA, "c1");
  choosing.set("t1", { tenantId: "studio-a", max: 2, done: false, picks: [] });
  const task = { id: "t1", folderId: nakato };
  assert.equal(await service.pick(studioA, task, contract, true, client), 1);
  assert.equal(await service.pick(studioA, task, clip, true, client), 2, "inside a folder in it counts too");
  const third = await upload(studioA, raw, "third.pdf", MB);
  await assert.rejects(service.pick(studioA, task, third, true, client), says(/as many as you can/));
  assert.equal(await service.pick(studioA, task, clip, false, client), 1);
  assert.deepEqual(await service.picks(studioA, "t1"), [contract]);
  // Nothing outside the task's folder, nothing they can't see, nothing once it's sent.
  await assert.rejects(service.pick(studioA, task, secret, true), says(/this task's folder/));
  await assert.rejects(service.pick(studioA, { id: "t1", folderId: null }, contract, true), says(/this task's folder/));
  await assert.rejects(service.pick(studioA, { id: "t1", folderId: raw }, secret, true, client), says(/file no longer exists/));
  choosing.get("t1")!.done = true;
  await assert.rejects(service.pick(studioA, task, clip, true, client), says(/already sent/));
});

test("a task's folder is shared with its client once, never lowering a share they have", async () => {
  const { service, nakato, raw } = await sharedDrive();
  await service.ensureShared(studioA, raw, { kind: "client", customerId: "c1" }, "viewer");
  await service.ensureShared(studioA, raw, { kind: "client", customerId: "c1" }, "viewer");
  assert.deepEqual((await service.shares(studioA)).map((s) => [s.folderId, s.role]), [[raw, "viewer"]]);
  await service.share(studioA, nakato, { kind: "member", memberId: "m1" }, settings("editor"));
  // Already in a folder shared with them above: nothing new.
  await service.ensureShared(studioA, raw, { kind: "member", memberId: "m1" }, "viewer");
  assert.equal((await service.shares(studioA)).length, 2);
  assert.equal((await service.list(studioA, raw, await service.memberAccess(studioA, "m1")))?.rights.change, true);
});

// ── Captions ───────────────────────────────────────────────────────────────

test("captions: the business writes them; a client only through their naming task, in its folder", async () => {
  const { service, nakato, raw, contract, clip, secret } = await sharedDrive();
  await service.setCaption(studioA, contract, "Nakato Sarah, Joel K.");
  assert.equal((await service.list(studioA, nakato))?.files.find((f) => f.id === contract)?.caption, "Nakato Sarah, Joel K.");
  await service.share(studioA, nakato, { kind: "client", customerId: "c1" }, settings("viewer", false));
  const client = await service.clientAccess(studioA, "c1");
  // A viewer can't caption on their own…
  await assert.rejects(service.setCaption(studioA, clip, "Amina", client), says(/can't rename, move or delete/));
  // …but can through their task, on the files in its folder only.
  await service.setCaption(studioA, clip, "Amina", client, { folderId: raw });
  await assert.rejects(service.setCaption(studioA, contract, "x", client, { folderId: raw }), says(/this task's folder/));
  await assert.rejects(service.setCaption(studioA, secret, "x", client, { folderId: nakato }), says(/file no longer exists/));
  await service.setCaption(studioA, clip, null, client, { folderId: nakato });
  assert.equal((await service.list(studioA, raw))?.files[0].caption, null);
  await assert.rejects(service.setCaption(studioB, contract, "x"), says(/file no longer exists/));
});

// ── Small copies of pictures ───────────────────────────────────────────────

test("a picture gets a preview and a thumbnail when it's uploaded; they show instead of it, and go with it", async () => {
  const { service, objects, upload } = fakes();
  const id = await upload(studioA, null, "IMG_01.JPG", 2 * MB, 2 * MB, undefined, "image/jpeg");
  const key = `studios/studio-a/files/${id}`;
  assert.deepEqual([...objects.keys()].sort(), [key, `${key}-preview.jpg`, `${key}-thumb.jpg`]);
  const [file] = (await service.list(studioA, null))!.files;
  assert.equal(file.previewUrl, `get://${key}-preview.jpg?as=`);
  assert.equal(file.thumbUrl, `get://${key}-thumb.jpg?as=`);
  assert.equal(file.downloadUrl, `get://${key}?as=IMG_01.JPG`, "the original is still the download");
  // The copies count toward the storage.
  assert.ok((await service.usage(studioA)).usedBytes > 2 * MB);
  await service.deleteFile(studioA, id);
  assert.equal(objects.size, 0);
});

test("proofs never show the original: no copies yet and no downloads means nothing, until they're made", async () => {
  const { service, files, upload, nakato } = await sharedDrive();
  const photo = await upload(studioA, nakato, "kid.jpg", 3 * MB, 3 * MB, undefined, "image/jpeg");
  // As if uploaded before copies were made.
  files.find((f) => f.id === photo)!.previewBytes = 0;
  await service.share(studioA, nakato, { kind: "client", customerId: "c1" }, settings("viewer", false));
  const client = await service.clientAccess(studioA, "c1");
  const before = (await service.list(studioA, nakato, client))!.files.find((f) => f.id === photo)!;
  assert.deepEqual([before.previewUrl, before.thumbUrl, before.downloadUrl], [null, null, null]);
  // The business still sees it (it may download it anyway).
  assert.ok((await service.list(studioA, nakato))!.files.find((f) => f.id === photo)!.previewUrl?.endsWith("as=kid.jpg"));
  // Waiting for copies, even where the original can stand in (the business may download it).
  assert.ok(FileService.missingPreviews((await service.list(studioA, nakato))!));
  assert.equal(await service.ensurePreviews(studioA, nakato), 0);
  assert.ok(!FileService.missingPreviews((await service.list(studioA, nakato))!));
  const after = (await service.list(studioA, nakato, client))!.files.find((f) => f.id === photo)!;
  assert.ok(after.previewUrl?.endsWith("-preview.jpg?as="));
  assert.equal(after.downloadUrl, null);
});

test("a picture whose copies can't be made still uploads; a PDF gets none", async () => {
  const { service, objects, upload } = fakes();
  const broken = await upload(studioA, null, "odd.png", 13, 13, undefined, "image/png");
  const pdf = await upload(studioA, null, "terms.pdf", MB);
  assert.deepEqual([...objects.keys()].sort(), [`studios/studio-a/files/${broken}`, `studios/studio-a/files/${pdf}`].sort());
  assert.equal((await service.list(studioA, null))!.files.find((f) => f.id === pdf)!.thumbUrl, null);
});

// ── Downloads ──────────────────────────────────────────────────────────────

test("a folder downloads with its folders as paths, as originals or optimised copies, only where downloads are allowed", async () => {
  const { service, upload, nakato, raw, contract } = await sharedDrive();
  const photo = await upload(studioA, raw, "IMG_01.HEIC", 2 * MB, 2 * MB, undefined, "image/heic");
  await upload(studioA, raw, "IMG_01.jpg", MB, MB, undefined, "image/jpeg");
  const originals = await service.downloads(studioA, { folderId: nakato }, "original");
  assert.deepEqual(originals.map((d) => d.path), ["contract.pdf", "Raw/clip.pdf", "Raw/IMG_01.HEIC", "Raw/IMG_01.jpg"]);
  const optimised = await service.downloads(studioA, { folderId: nakato }, "optimised");
  assert.deepEqual(optimised.map((d) => d.path), ["contract.pdf", "Raw/clip.pdf", "Raw/IMG_01.jpg", "Raw/IMG_01 (2).jpg"]);
  assert.ok(optimised.find((d) => d.path === "Raw/IMG_01.jpg")!.url.includes(`${photo}-preview.jpg`));
  assert.deepEqual((await service.downloads(studioA, { fileIds: [contract] }, "optimised")).map((d) => d.path), ["contract.pdf"]);
  // Shared without downloads: nothing.
  await service.share(studioA, nakato, { kind: "client", customerId: "c1" }, settings("viewer", false));
  const client = await service.clientAccess(studioA, "c1");
  await assert.rejects(service.downloads(studioA, { fileIds: [contract] }, "original", client), says(/can't be downloaded/));
  assert.deepEqual(await service.downloads(studioA, { folderId: nakato }, "original", client), []);
  assert.equal((await service.list(studioA, raw, client))!.files.find((f) => f.id === photo)!.optimisedUrl ?? null, null);
  assert.ok((await service.list(studioA, raw))!.files.find((f) => f.id === photo)!.optimisedUrl?.endsWith("as=IMG_01.jpg"));
});

test("a whole folder, picked: its files and its folders' files, only what the person may see", async () => {
  const { service, nakato, raw } = await sharedDrive();
  assert.deepEqual((await service.filesWithin(studioA, nakato)).map((f) => f.name), ["contract.pdf", "clip.pdf"]);
  await assert.rejects(service.filesWithin(studioB, nakato), says(/no longer exists/));
  await service.share(studioA, raw, { kind: "client", customerId: "c1" }, settings("viewer", true));
  const client = await service.clientAccess(studioA, "c1");
  assert.deepEqual((await service.filesWithin(studioA, raw, client)).map((f) => f.name), ["clip.pdf"]);
  await assert.rejects(service.filesWithin(studioA, nakato, client), says(/no longer exists/));
});

test("a sent choice's photos move into a 'Chosen by …' folder inside the task's folder", async () => {
  const { service, upload, choosing, nakato, raw, contract, clip, amina, secret } = await sharedDrive();
  const twin = await upload(studioA, nakato, "clip.pdf", MB);
  choosing.set("t1", { tenantId: "studio-a", max: 9, done: false, picks: [contract, clip, twin, secret] });
  const folder = await service.gatherPicks(studioA, { id: "t1", folderId: nakato }, "Chosen by Nakato");
  const there = (await service.list(studioA, folder))!;
  assert.equal(there.folder?.name, "Chosen by Nakato");
  assert.equal(there.folder?.parentId, nakato);
  assert.deepEqual(there.files.map((f) => f.name).sort(), ["clip (2).pdf", "clip.pdf", "contract.pdf"]);
  assert.deepEqual((await service.list(studioA, raw))!.files, []);
  // Outside the task's folder: left where it is.
  assert.deepEqual((await service.list(studioA, amina))!.files.map((f) => f.id), [secret]);
  // A second round gets its own folder.
  const again = await service.gatherPicks(studioA, { id: "t1", folderId: nakato }, "Chosen by Nakato");
  assert.equal((await service.list(studioA, again))!.folder?.name, "Chosen by Nakato (2)");
});
