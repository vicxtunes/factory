import assert from "node:assert/strict";
import { test } from "node:test";

import { planRenames, BUSINESS_ROOT, businessTree, cleanName, isBusinessId, isLocked, isWithin, pathTo, uniqueName, uploadStartSchema, type Folder } from "./index";

const folder = (id: string, parentId: string | null, name: string): Folder => ({ id, parentId, name, projectId: null, holdsProjects: false });
const folders: Folder[] = [folder("clients", null, "Clients"), folder("weddings", "clients", "Weddings"), folder("2026", "weddings", "2026"), folder("contracts", null, "Contracts")];

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

test("Business: Services and Products, each category, each service or product with its album; all locked", () => {
  const tree = businessTree(
    [
      { id: "c1", kind: "service", name: "Weddings", services: [{ id: "s1", name: "Wedding Photography", fromAming: false }] },
      { id: "c2", kind: "product", name: "Photobooks", services: [{ id: "p1", name: "Classic", fromAming: true }] },
    ],
    new Map([["s1", "a1"]]),
  );
  assert.deepEqual(
    tree.map((f) => [f.id, f.parentId, f.name]),
    [
      ["business", null, "Business"],
      ["business-services", "business", "Services"],
      ["business-products", "business", "Products"],
      ["business-category-c1", "business-services", "Weddings"],
      ["business-item-s1", "business-category-c1", "Wedding Photography"],
      ["business-category-c2", "business-products", "Photobooks"],
      ["business-item-p1", "business-category-c2", "Classic"],
    ],
  );
  assert.deepEqual(tree[3].business, { kind: "category", categoryId: "c1", offering: "service" });
  assert.deepEqual(tree[4].business, { kind: "item", serviceId: "s1", albumId: "a1", fromAming: false, offering: "service" });
  assert.deepEqual(tree[6].business, { kind: "item", serviceId: "p1", albumId: null, fromAming: true, offering: "product" });
  assert.ok(tree.every(isLocked));
  assert.deepEqual(pathTo(tree, "business-item-s1").map((f) => f.name), ["Business", "Services", "Weddings", "Wedding Photography"]);
  assert.ok(isBusinessId(BUSINESS_ROOT) && isBusinessId("business-item-s1"));
  assert.ok(!isBusinessId("0b6c1d5e-0000-4000-8000-000000000000"));
  assert.ok(!isLocked(folders[0]));
});

test("renaming many by pattern: numbered by name or date, extensions kept, {name} and {date}", () => {
  const items = [
    { kind: "file" as const, id: "1", name: "IMG_0003.JPG", createdAt: "2026-10-01T10:00:00Z" },
    { kind: "file" as const, id: "2", name: "IMG_0001.jpg", createdAt: "2026-10-03T10:00:00Z" },
    { kind: "folder" as const, id: "3", name: "Raw.v2", createdAt: null },
  ];
  const byName = planRenames(items, { mode: "pattern", pattern: "Nakato-{#}", start: 1, digits: 3, order: "name" }, []);
  assert.deepEqual(byName.map((p) => [p.from, p.to, p.problem]), [
    ["IMG_0001.jpg", "Nakato-001.jpg", null],
    ["IMG_0003.JPG", "Nakato-002.JPG", null],
    ["Raw.v2", "Nakato-003", null],
  ]);
  const byDate = planRenames(items.slice(0, 2), { mode: "pattern", pattern: "{date} {name} ({#})", start: 7, digits: 1, order: "date" }, []);
  assert.deepEqual(byDate.map((p) => p.to), ["2026-10-01 IMG_0003 (7).JPG", "2026-10-03 IMG_0001 (8).jpg"]);
});

test("renaming many: find and replace, and clashes, empty and too long names flagged", () => {
  const items = [
    { kind: "file" as const, id: "1", name: "img-01.jpg", createdAt: null },
    { kind: "file" as const, id: "2", name: "IMG-02.jpg", createdAt: null },
  ];
  assert.deepEqual(
    planRenames(items, { mode: "replace", find: "img", replace: "Nakato", matchCase: false }, []).map((p) => p.to),
    ["Nakato-01.jpg", "Nakato-02.jpg"],
  );
  assert.deepEqual(
    planRenames(items, { mode: "replace", find: "img", replace: "Nakato", matchCase: true }, []).map((p) => p.to),
    ["Nakato-01.jpg", "IMG-02.jpg"],
  );
  const same = planRenames(items, { mode: "pattern", pattern: "photo", start: 1, digits: 1, order: "name" }, []);
  assert.deepEqual(same.map((p) => p.problem), ["Clashes with another name here.", "Clashes with another name here."]);
  const taken = planRenames(items.slice(0, 1), { mode: "pattern", pattern: "keep", start: 1, digits: 1, order: "name" }, ["KEEP.jpg"]);
  assert.equal(taken[0].problem, "Clashes with another name here.");
  assert.equal(planRenames(items.slice(0, 1), { mode: "pattern", pattern: " / ", start: 1, digits: 1, order: "name" }, [])[0].problem, "Needs a name.");
  assert.equal(planRenames(items.slice(0, 1), { mode: "pattern", pattern: "x".repeat(250), start: 1, digits: 1, order: "name" }, [])[0].problem, "Too long.");
});
