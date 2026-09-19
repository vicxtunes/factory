"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { UploadRow } from "@/components/ui/UploadRow";
import type { ExportColumn } from "@/lib/export/tableExport";
import {
  clearProductDisplayImage,
  clearProductPreviewVideo,
  deleteProductMedia,
} from "@/lib/storage/product-media-actions";
import { uploadProductMedia } from "@/lib/storage/product-media-client";
import type {
  AttributeType,
  CategoryAttribute,
  Currency,
  Product,
  ProductCategory,
  ShowroomSettings,
} from "@/lib/types";

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
  setCurrencySymbol,
  setProductActive,
  setProductDescription,
  setProductPrice,
  setShowPrices,
  setVariantActive,
  setVariantPrice,
  updateAttribute,
  type AttributeInput,
} from "./actions";

type MutationResult = { ok: boolean; error?: string };

const ATTRIBUTE_TYPES: AttributeType[] = ["text", "number", "select"];

interface CategoryExportRow extends Record<string, unknown> {
  name: string;
  products: number;
  fields: number;
  status: string;
}

const EXPORT_COLUMNS: ExportColumn<CategoryExportRow>[] = [
  { key: "name", label: "Category" },
  { key: "products", label: "Products" },
  { key: "fields", label: "Custom fields" },
  { key: "status", label: "Status" },
];

// The showroom product-view-mode toggle (3D scene vs. photo carousel) that
// used to live here is hidden for now, per the boss — product_view_mode
// still exists on showroom_settings and still drives product-showcase.tsx,
// it just can't be changed from this panel any more; only this "show
// prices" switch is exposed today.
function ShowroomSettingsCard({
  settings,
  run,
  pending,
}: {
  settings: ShowroomSettings;
  run: (fn: () => Promise<MutationResult>) => void;
  pending: boolean;
}) {
  const options: { value: boolean; label: string; hint: string }[] = [
    { value: false, label: "Hidden", hint: 'Clients see "Pricing confirmed after review"' },
    { value: true, label: "Visible to clients", hint: "Shows each product/variant's recorded price" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Showroom pricing</p>
      <p className="mt-1 text-xs text-muted">
        Whether the showroom and order form show product/variant prices to clients.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            disabled={pending}
            onClick={() => {
              if (opt.value !== settings.show_prices) run(() => setShowPrices(opt.value));
            }}
            title={opt.hint}
            className={`rounded-[var(--radius)] border px-3 py-2 text-left text-xs transition-colors ${
              settings.show_prices === opt.value
                ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                : "border-border text-muted hover:bg-background"
            }`}
          >
            <span className="block font-semibold">{opt.label}</span>
            <span className="block text-[0.65rem]">{opt.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// The single display symbol for every price (the business prices in one
// currency). Saved on blur/Enter to the base currency row.
function CurrencySymbolCard({
  currencies,
  run,
  pending,
}: {
  currencies: Currency[];
  run: (fn: () => Promise<MutationResult>) => void;
  pending: boolean;
}) {
  const current = currencies.find((c) => c.is_base)?.symbol ?? "UGX";
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Currency symbol</p>
      <p className="mt-1 text-xs text-muted">Shown before every price, e.g. &ldquo;UGX 150,000&rdquo;.</p>
      <input
        key={current}
        defaultValue={current}
        maxLength={8}
        disabled={pending}
        className="mt-3 min-h-9 w-28 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
        onBlur={(e) => {
          const value = e.target.value.trim();
          if (value && value !== current) run(() => setCurrencySymbol(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

export function ProductPanel({
  categories,
  showroomSettings,
  currencies,
  canManage = true,
}: {
  categories: ProductCategory[];
  showroomSettings: ShowroomSettings;
  currencies: Currency[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function run(fn: () => Promise<MutationResult>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  const openCategory = categories.find((c) => c.id === openCategoryId) ?? null;
  const exportRows: CategoryExportRow[] = categories.map((c) => ({
    name: c.name,
    products: c.products.length,
    fields: c.attributes.length,
    status: c.active ? "Active" : "Inactive",
  }));

  return (
    <div className="space-y-4">
      {canManage ? <ShowroomSettingsCard settings={showroomSettings} run={run} pending={pending} /> : null}
      {canManage ? <CurrencySymbolCard currencies={currencies} run={run} pending={pending} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ExportButtons columns={EXPORT_COLUMNS} rows={exportRows} filename="product-categories" />
        {canManage ? (
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            + Add category
          </Button>
        ) : null}
      </div>

      {canManage ? (
        <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Add category">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const res = await createCategory(newCategoryName);
                if (res.ok) {
                  setNewCategoryName("");
                  setFormOpen(false);
                }
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
            <Button variant="primary" type="submit" disabled={pending} className="w-full">
              Add category
            </Button>
            {error ? <p className="text-sm text-error-600">{error}</p> : null}
          </form>
        </Drawer>
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

      {canManage ? (
        // Boss-only, and only here (the boss is the one setting it) — not
        // shown to other dashboard roles, and not shown to clients at all
        // right now (see Product.price's comment in lib/types.ts).
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <span>Price:</span>
          <input
            type="number"
            min="0"
            step="0.01"
            defaultValue={product.price ?? ""}
            placeholder="—"
            className="min-h-7 w-24 rounded-[var(--radius)] border border-border bg-surface px-2 text-xs"
            onBlur={(e) => {
              if (e.target.value !== (product.price?.toString() ?? "")) {
                run(() => setProductPrice(product.id, e.target.value));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-1.5 text-xs text-muted">
          <span>Description:</span>
          <textarea
            defaultValue={product.description ?? ""}
            placeholder="Shown to clients under the product name"
            rows={2}
            className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-2 py-1 text-xs"
            onBlur={(e) => {
              if (e.target.value.trim() !== (product.description ?? "")) {
                run(() => setProductDescription(product.id, e.target.value));
              }
            }}
          />
        </div>
      ) : null}

      {canManage ? <ProductMediaSection product={product} run={run} pending={pending} /> : null}

      <div className="mt-2 space-y-1.5 border-t border-border pt-2">
        {product.variants.length === 0 && !canManage ? (
          <p className="text-xs text-muted">No variants.</p>
        ) : null}
        {product.variants.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={v.active ? "" : "text-muted line-through"}>{v.name}</span>
              {canManage ? (
                // Overrides the product's own price for this size/variant —
                // not shown to clients yet either, same as the product price.
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={v.price ?? ""}
                  placeholder="price"
                  className="min-h-6 w-16 rounded-[var(--radius)] border border-border bg-surface px-1.5 text-xs"
                  onBlur={(e) => {
                    if (e.target.value !== (v.price?.toString() ?? "")) {
                      run(() => setVariantPrice(v.id, e.target.value));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              ) : null}
            </div>
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

// Display image + preview video (one slot each, overwritten on re-upload)
// plus an open-ended gallery of extra photos/videos — shown to clients
// behind the showroom's "View more detail" toggle. Uploads go straight to
// Supabase Storage (lib/storage/product-media-client.ts), so `run` here
// just drives the same shared pending/error/refresh flow as every other
// mutation on this panel.
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

function ProgressOverlay({ progress }: { progress: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
      <span className="text-sm font-semibold tabular-nums">{Math.round(progress * 100)}%</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/25">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

// Read-only view of a single media slot. Shows what's uploaded, with
// Replace / Remove revealed on hover. No dropzone — uploading lives
// separately in the Upload panel below.
function MediaPreview({
  label,
  url,
  kind,
  pending,
  onReplace,
  onClear,
}: {
  label: string;
  url: string | null;
  kind: "image" | "video";
  pending: boolean;
  onReplace: () => void;
  onClear: () => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-foreground">{label}</p>
      <div className="group relative h-36 overflow-hidden rounded-xl border border-border bg-background">
        {url ? (
          kind === "video" ? (
            <video src={url} className="h-full w-full object-cover" muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, can't be allowlisted for next/image
            <img src={url} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            Nothing uploaded yet
          </div>
        )}

        {url ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-all duration-150 group-hover:bg-black/50 group-hover:opacity-100">
            <button
              type="button"
              onClick={onReplace}
              disabled={pending}
              title="Replace"
              aria-label="Replace"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#1b2a4b] transition-transform hover:scale-105"
            >
              <RefreshIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={pending}
              title="Remove"
              aria-label="Remove"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[var(--rush)] transition-transform hover:scale-105"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface GalleryUpload {
  id: string;
  previewUrl: string;
  kind: "photo" | "video";
  progress: number;
}

function ProductMediaSection({
  product,
  run,
  pending,
}: {
  product: Product;
  run: (fn: () => Promise<MutationResult>) => void;
  pending: boolean;
}) {
  const [displayProgress, setDisplayProgress] = useState<number | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [galleryUploads, setGalleryUploads] = useState<GalleryUpload[]>([]);

  // Hidden inputs whose pickers the Preview panel's Replace buttons open.
  // The visible pickers live inside the Upload panel's UploadRow components.
  const displayInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Uploading into a slot that already has something deletes that old file
  // for good (see confirmProductMediaUpload) — confirm before it happens,
  // regardless of which of the two pickers (Preview panel's Replace button,
  // or the Upload panel's row below) the boss used to get here.
  function uploadDisplay(file: File) {
    if (
      product.display_image_url &&
      !window.confirm("Replacing the display image will permanently delete the current one. Continue?")
    ) {
      return;
    }
    setDisplayProgress(0);
    run(async () => {
      const res = await uploadProductMedia(product.id, "display", file, setDisplayProgress);
      setDisplayProgress(null);
      return res;
    });
  }

  function uploadVideo(file: File) {
    if (
      product.preview_video_url &&
      !window.confirm("Replacing the preview video will permanently delete the current one. Continue?")
    ) {
      return;
    }
    setVideoProgress(0);
    run(async () => {
      const res = await uploadProductMedia(product.id, "preview_video", file, setVideoProgress);
      setVideoProgress(null);
      return res;
    });
  }

  // One transition uploads the whole batch sequentially (same pattern as
  // components/media/AddMediaButton.tsx) — each file gets its own ghost
  // tile + progress bar in the grid below, and disappears the moment its
  // own upload finishes rather than waiting for the whole batch.
  function uploadGalleryFiles(files: FileList | File[]) {
    const entries: (GalleryUpload & { file: File })[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      kind: file.type.startsWith("video/") ? "video" : "photo",
      progress: 0,
    }));
    if (entries.length === 0) return;
    setGalleryUploads((prev) => [...prev, ...entries]);

    run(async () => {
      let error: string | null = null;
      for (const entry of entries) {
        const res = await uploadProductMedia(product.id, "gallery", entry.file, (p) => {
          setGalleryUploads((prev) => prev.map((u) => (u.id === entry.id ? { ...u, progress: p } : u)));
        });
        setGalleryUploads((prev) => prev.filter((u) => u.id !== entry.id));
        URL.revokeObjectURL(entry.previewUrl);
        if (!res.ok) error = res.error;
      }
      return error ? { ok: false, error } : { ok: true };
    });
  }

  return (
    <div className="mt-3 space-y-4 border-t border-border pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Media</p>

      {/* ---- Preview panel: shows current state, no dropzones ---- */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Preview</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <MediaPreview
            label="Display image"
            url={product.display_image_url}
            kind="image"
            pending={pending}
            onReplace={() => displayInputRef.current?.click()}
            onClear={() => {
              if (window.confirm("Remove the display image completely? This can't be undone.")) {
                run(() => clearProductDisplayImage(product.id));
              }
            }}
          />
          <MediaPreview
            label="Preview video"
            url={product.preview_video_url}
            kind="video"
            pending={pending}
            onReplace={() => videoInputRef.current?.click()}
            onClear={() => {
              if (window.confirm("Remove the preview video completely? This can't be undone.")) {
                run(() => clearProductPreviewVideo(product.id));
              }
            }}
          />
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-foreground">
            More media{product.media.length > 0 ? ` (${product.media.length})` : ""}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {product.media.map((m) => (
              <div
                key={m.id}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border"
              >
                {m.kind === "video" ? (
                  <video src={m.secure_url} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, can't be allowlisted for next/image
                  <img src={m.secure_url} alt="" className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Remove this item completely? This can't be undone.")) {
                      run(() => deleteProductMedia(m.id));
                    }
                  }}
                  disabled={pending}
                  title="Remove"
                  aria-label="Remove"
                  className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all duration-150 group-hover:bg-black/50 group-hover:opacity-100"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}

            {galleryUploads.map((u) => (
              <div
                key={u.id}
                className="relative aspect-square overflow-hidden rounded-lg border border-border"
              >
                {u.kind === "video" ? (
                  <video src={u.previewUrl} className="h-full w-full object-cover opacity-50" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a remote asset
                  <img src={u.previewUrl} alt="" className="h-full w-full object-cover opacity-50" />
                )}
                <ProgressOverlay progress={u.progress} />
              </div>
            ))}

            {product.media.length === 0 && galleryUploads.length === 0 ? (
              <p className="col-span-full text-xs text-muted">No additional media yet.</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---- Upload panel: controls only, no previews ---- */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Upload</p>
        <div className="space-y-2">
          <UploadRow
            label="Display image"
            hint="Shown in the showroom grid"
            accept="image/*"
            disabled={pending}
            progress={displayProgress}
            onFiles={(files) => {
              const file = files[0];
              if (file) uploadDisplay(file);
            }}
          />
          <UploadRow
            label="Preview video"
            hint="Optional — shown in the product view"
            accept="video/*"
            disabled={pending}
            progress={videoProgress}
            onFiles={(files) => {
              const file = files[0];
              if (file) uploadVideo(file);
            }}
          />
          <UploadRow
            label="More media"
            hint="Add photos or videos to the gallery"
            accept="image/*,video/*"
            multiple
            disabled={pending}
            onFiles={uploadGalleryFiles}
          />
        </div>
      </div>

      {/* Hidden inputs — the Preview panel's Replace buttons trigger these */}
      <input
        ref={displayInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) uploadDisplay(file);
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) uploadVideo(file);
        }}
      />
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