import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanName, isWithin, pathTo, uniqueName, uploadStartSchema, type Folder } from "./index";

const folders: Folder[] = [
  { id: "clients", parentId: null, name: "Clients" },
  { id: "weddings", parentId: "clients", name: "Weddings" },
  { id: "2026", parentId: "weddings", name: "2026" },
  { id: "contracts", parentId: null, name: "Contracts" },
];

test("a name loses path separators and control characters", () => {
  assert.equal(cleanName("  ../etc/passwd\n "), ".. etc passwd");
  assert.equal(cleanName("a\\b\u0000c"), "a b c");
  assert.equal(cleanName(" / "), "");
});

test("a taken name gets a number before its extension, whatever the capitals", () => {
  assert.equal(uniqueName("report.pdf", []), "report.pdf");
  assert.equal(uniqueName("report.pdf", ["Report.PDF"]), "report (2).pdf");
  assert.equal(uniqueName("report.pdf", ["report.pdf", "report (2).pdf"]), "report (3).pdf");
  assert.equal(uniqueName("notes", ["notes"]), "notes (2)");
  assert.equal(uniqueName(".env", [".env"]), ".env (2)");
});

test("a folder's path runs from the top down", () => {
  assert.deepEqual(pathTo(folders, "2026").map((f) => f.name), ["Clients", "Weddings", "2026"]);
  assert.deepEqual(pathTo(folders, null), []);
  assert.deepEqual(pathTo(folders, "gone"), []);
});

test("a folder is within itself and its ancestors only", () => {
  assert.equal(isWithin(folders, "2026", "clients"), true);
  assert.equal(isWithin(folders, "clients", "clients"), true);
  assert.equal(isWithin(folders, "clients", "2026"), false);
  assert.equal(isWithin(folders, "contracts", "clients"), false);
  assert.equal(isWithin(folders, null, "clients"), false);
});

test("an upload's files are cleaned, sized and typed", () => {
  const ok = uploadStartSchema.parse({ folderId: null, files: [{ name: " a/b.pdf ", bytes: 10, contentType: "" }] });
  assert.deepEqual(ok.files[0], { name: "a b.pdf", bytes: 10, contentType: "application/octet-stream" });
  assert.equal(uploadStartSchema.safeParse({ folderId: null, files: [{ name: "a", bytes: 0, contentType: "text/plain" }] }).success, false);
  assert.equal(uploadStartSchema.safeParse({ folderId: null, files: [{ name: "a", bytes: 2 * 1024 ** 3, contentType: "text/plain" }] }).success, false);
  assert.equal(uploadStartSchema.safeParse({ folderId: null, files: [{ name: "/", bytes: 1, contentType: "text/plain" }] }).success, false);
});
