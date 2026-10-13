import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Folder, StoredFile } from "./core";
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
  };
  const used = (t: string) => files.filter((f) => f.tenantId === t).reduce((s, f) => s + f.bytes, 0);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const folderTaken = (t: string, parentId: string | null, name: string, except?: string) =>
    folders.some((f) => f.tenantId === t && f.parentId === parentId && same(f.name, name) && f.id !== except);
  const fileTaken = (t: string, folderId: string | null, name: string, except?: string) =>
    files.some((f) => f.tenantId === t && f.folderId === folderId && same(f.name, name) && f.id !== except);
  const repo: FileRepository = {
    usage: async (s) => ({ usedBytes: used(s.tenantId), quotaBytes }),
    folders: async (s) => folders.filter((f) => f.tenantId === s.tenantId).map(({ id, parentId, name }) => ({ id, parentId, name })),
    createFolder: async (s, f) => {
      if (folderTaken(s.tenantId, f.parentId, f.name)) throw new FileError("There's already a folder with that name here.");
      folders.push({ ...f, id: `d${folders.length + 1}`, tenantId: s.tenantId });
      return `d${folders.length}`;
    },
    updateFolder: async (s, id, f) => {
      const folder = folders.find((x) => x.tenantId === s.tenantId && x.id === id);
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
      files.push({ ...f, tenantId: s.tenantId, createdAt: "2026-10-13T00:00:00Z" });
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
  };
  const service = new FileService(repo, store, () => `f${++n}`);
  /** Uploads one file the way the browser does: ask, PUT (here: set its real size), confirm. */
  async function upload(s: TenantScope, folderId: string | null, name: string, bytes: number, claimed = bytes) {
    const [ticket] = await service.startUpload(s, folderId, [{ name, bytes: claimed, contentType: "application/pdf" }]);
    objects.set(`incoming/${s.tenantId}/file-${ticket.fileId}`, bytes);
    await service.confirmUpload(s, { folderId, fileId: ticket.fileId, name, contentType: "application/pdf" });
    return ticket.fileId;
  }
  return { service, objects, files, folders, upload };
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
