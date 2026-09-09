"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Select, TextInput } from "@/components/ui/Field";
import type { AttributeType, CategoryAttribute, Product, ProductCategory } from "@/lib/types";

import {
  createAttribute,
  createCategory,
  createProduct,
  createVariant,
  deleteAttribute,
  renameCategory,
  renameProduct,
  renameVariant,
  setCategoryActive,
  setProductActive,
  setVariantActive,
  updateAttribute,
  type AttributeInput,
} from "./actions";

type MutationResult = { ok: boolean; error?: string };

const ATTRIBUTE_TYPES: AttributeType[] = ["text", "number", "select"];

export function ProductPanel({
  categories,
  canManage = true,
}: {
  categories: ProductCategory[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  function run(fn: () => Promise<MutationResult>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  const openCategory = categories.find((c) => c.id === openCategoryId) ?? null;

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const res = await createCategory(newCategoryName);
                if (res.ok) setNewCategoryName("");
                return res;
              });
            }}
          >
            <TextInput
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
              required
            />
            <Button variant="primary" type="submit" disabled={pending}>
              Add category
            </Button>
          </form>
          {error ? <p className="mt-3 text-sm text-error-600">{error}</p> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Category</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Products</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Custom fields</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Status</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Actions</p>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-background">
                  <td className="px-5 py-3">
                    {renamingId === c.id ? (
                      <input
                        autoFocus
                        defaultValue={c.name}
                        className="min-h-9 w-40 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
                        onBlur={(e) => {
                          setRenamingId(null);
                          if (e.target.value.trim() && e.target.value !== c.name) {
                            run(() => renameCategory(c.id, e.target.value));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                    ) : (
                      <button
                        className={`font-medium underline-offset-2 hover:underline ${c.active ? "" : "text-muted line-through"}`}
                        onClick={() => setOpenCategoryId(c.id)}
                      >
                        {c.name}
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted">{c.products.length}</td>
                  <td className="px-5 py-3 text-muted">{c.attributes.length}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.active
                          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
                          : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
                      }`}
                    >
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        className="min-h-9 text-xs"
                        onClick={() => setOpenCategoryId(c.id)}
                      >
                        {canManage ? "Manage" : "View"}
                      </Button>
                      {canManage ? (
                        <>
                          <Button
                            variant="secondary"
                            className="min-h-9 text-xs"
                            onClick={() => setRenamingId(c.id)}
                          >
                            Rename
                          </Button>
                          {c.active ? (
                            <Button
                              variant="danger"
                              className="min-h-9 text-xs"
                              disabled={pending}
                              onClick={() => run(() => setCategoryActive(c.id, false))}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              className="min-h-9 text-xs"
                              disabled={pending}
                              onClick={() => run(() => setCategoryActive(c.id, true))}
                            >
                              Reactivate
                            </Button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-muted">
                    No categories yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer open={openCategory != null} onClose={() => setOpenCategoryId(null)} title={openCategory?.name}>
        {openCategory ? (
          <CategoryDetail category={openCategory} run={run} pending={pending} canManage={canManage} />
        ) : null}
      </Drawer>
    </div>
  );
}

function CategoryDetail({
  category,
  run,
  pending,
  canManage,
}: {
  category: ProductCategory;
  run: (fn: () => Promise<MutationResult>) => void;
  pending: boolean;
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"products" | "fields">("products");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          className={`rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium ${
            tab === "products" ? "bg-brand-500 text-white" : "text-muted"
          }`}
          onClick={() => setTab("products")}
        >
          Products
        </button>
        <button
          className={`rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium ${
            tab === "fields" ? "bg-brand-500 text-white" : "text-muted"
          }`}
          onClick={() => setTab("fields")}
        >
          Custom fields
        </button>
      </div>

      {tab === "products" ? (
        <ProductsTab category={category} run={run} pending={pending} canManage={canManage} />
      ) : (
        <AttributesTab category={category} run={run} pending={pending} canManage={canManage} />
      )}
    </div>
  );
}

function ProductsTab({
  category,
  run,
  pending,
  canManage,
}: {
  category: ProductCategory;
  run: (fn: () => Promise<MutationResult>) => void;
  pending: boolean;
  canManage: boolean;
}) {
  const [newName, setNewName] = useState("");

  return (
    <div className="space-y-3">
      {canManage ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await createProduct(category.id, newName);
              if (res.ok) setNewName("");
              return res;
            });
          }}
        >
          <TextInput
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New product name"
            required
          />
          <Button variant="primary" type="submit" disabled={pending}>
            Add
          </Button>
        </form>
      ) : null}

      <div className="space-y-3">
        {category.products.map((p) => (
          <ProductCard key={p.id} product={p} run={run} pending={pending} canManage={canManage} />
        ))}
        {category.products.length === 0 ? (
          <p className="text-sm text-muted">No products in this category yet.</p>
        ) : null}
      </div>
    </div>
  );
}

function ProductCard({
  product,
  run,
  pending,
  canManage,
}: {
  product: Product;
  run: (fn: () => Promise<MutationResult>) => void;
  pending: boolean;
  canManage: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newVariant, setNewVariant] = useState("");

  return (
    <div className="rounded-[var(--radius)] border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <input
            autoFocus
            defaultValue={product.name}
            className="min-h-9 flex-1 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
            onBlur={(e) => {
              setRenaming(false);
              if (e.target.value.trim() && e.target.value !== product.name) {
                run(() => renameProduct(product.id, e.target.value));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <span className={product.active ? "font-medium" : "text-muted line-through"}>
            {product.name}
          </span>
        )}
        {canManage ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="secondary" className="min-h-8 text-xs" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            {product.active ? (
              <Button
                variant="danger"
                className="min-h-8 text-xs"
                disabled={pending}
                onClick={() => run(() => setProductActive(product.id, false))}
              >
                Deactivate
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="min-h-8 text-xs"
                disabled={pending}
                onClick={() => run(() => setProductActive(product.id, true))}
              >
                Reactivate
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-2 space-y-1.5 border-t border-border pt-2">
        {product.variants.length === 0 && !canManage ? (
          <p className="text-xs text-muted">No variants.</p>
        ) : null}
        {product.variants.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
            <span className={v.active ? "" : "text-muted line-through"}>{v.name}</span>
            {canManage ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  className="text-xs text-muted underline-offset-2 hover:underline"
                  onClick={() => {
                    const next = window.prompt("Rename variant", v.name);
                    if (next && next.trim() && next !== v.name) {
                      run(() => renameVariant(v.id, next));
                    }
                  }}
                >
                  Rename
                </button>
                {v.active ? (
                  <button
                    className="text-xs text-[var(--rush)]"
                    disabled={pending}
                    onClick={() => run(() => setVariantActive(v.id, false))}
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    className="text-xs text-muted"
                    disabled={pending}
                    onClick={() => run(() => setVariantActive(v.id, true))}
                  >
                    Reactivate
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ))}
        {canManage ? (
          <form
            className="flex gap-1.5 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const res = await createVariant(product.id, newVariant);
                if (res.ok) setNewVariant("");
                return res;
              });
            }}
          >
            <input
              value={newVariant}
              onChange={(e) => setNewVariant(e.target.value)}
              placeholder="New variant"
              className="min-h-8 flex-1 rounded-[var(--radius)] border border-border bg-surface px-2 text-xs"
            />
            <button type="submit" className="text-xs text-brand-600" disabled={pending}>
              Add
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function emptyAttributeForm(): AttributeInput {
  return { name: "", type: "text", options: [], required: true, sortOrder: 0 };
}

function AttributesTab({
  category,
  run,
  pending,
  canManage,
}: {
  category: ProductCategory;
  run: (fn: () => Promise<MutationResult>) => void;
  pending: boolean;
  canManage: boolean;
}) {
  const [form, setForm] = useState<AttributeInput>(emptyAttributeForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  function startEdit(attr: CategoryAttribute) {
    setEditingId(attr.id);
    setForm({
      name: attr.name,
      type: attr.type,
      options: attr.options ?? [],
      required: attr.required,
      sortOrder: attr.sort_order,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyAttributeForm());
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        These fields appear on intake when this category is picked for an item — e.g. Photo
        Books&apos; Size/Lamination/Cover Type/Packaging.
        {canManage ? " Add, edit, or remove fields here with no code change needed." : ""}
      </p>

      <div className="space-y-2">
        {category.attributes.map((attr) => (
          <div
            key={attr.id}
            className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-border p-2 text-sm"
          >
            <div>
              <span className="font-medium">{attr.name}</span>{" "}
              <span className="text-xs text-muted">
                ({attr.type}
                {attr.type === "select" && attr.options ? `: ${attr.options.join(", ")}` : ""}
                {attr.required ? "" : ", optional"})
              </span>
            </div>
            {canManage ? (
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="secondary" className="min-h-8 text-xs" onClick={() => startEdit(attr)}>
                  Edit
                </Button>
                <Button
                  variant="danger"
                  className="min-h-8 text-xs"
                  disabled={pending}
                  onClick={() => run(() => deleteAttribute(attr.id))}
                >
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        {category.attributes.length === 0 ? (
          <p className="text-sm text-muted">No custom fields for this category yet.</p>
        ) : null}
      </div>

      {canManage ? (
      <form
        className="space-y-3 rounded-[var(--radius)] border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const res = editingId
              ? await updateAttribute(editingId, form)
              : await createAttribute(category.id, form);
            if (res.ok) resetForm();
            return res;
          });
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {editingId ? "Edit field" : "Add field"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Field name">
            <TextInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Size"
              required
            />
          </Field>
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AttributeType })}
            >
              {ATTRIBUTE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          {form.type === "select" ? (
            <div className="sm:col-span-2">
              <Field label="Options" hint="Comma-separated, e.g. 8x8, 10x10, 12x12">
                <TextInput
                  value={form.options.join(", ")}
                  onChange={(e) =>
                    setForm({ ...form, options: e.target.value.split(",").map((o) => o.trim()) })
                  }
                  required
                />
              </Field>
            </div>
          ) : null}
          <Field label="Order" hint="Lower numbers show first">
            <TextInput
              type="number"
              className="tnum"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
            />
            Required at intake
          </label>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" type="submit" disabled={pending}>
            {editingId ? "Save field" : "Add field"}
          </Button>
          {editingId ? (
            <Button variant="secondary" type="button" onClick={resetForm}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
      ) : null}
    </div>
  );
}
