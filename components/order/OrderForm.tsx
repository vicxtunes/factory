"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { addMediaLink } from "@/lib/storage/actions";
import { uploadFileToStorage } from "@/lib/storage/upload-client";
import type {
  ClientDuplicateHit,
  CreateOrderResult,
  OrderFormPayload,
  OrderItemInput,
} from "@/lib/orders/types";
import type {
  Agent,
  Client,
  DesignerPublic,
  OrderType,
  ProductCategory,
  WorkerPublic,
} from "@/lib/types";

type Variant = "manager" | "designer";

export interface OrderFormProps {
  variant: Variant;
  clients: Client[];
  agents: Agent[];
  catalog: ProductCategory[];
  workers: WorkerPublic[];
  designers?: DesignerPublic[];
  onCreate: (payload: OrderFormPayload) => Promise<CreateOrderResult>;
  onCheckDuplicates: (input: {
    name: string;
    email: string;
    phone: string;
  }) => Promise<{ ok: true; hits: ClientDuplicateHit[] } | { ok: false; error: string }>;
  // Fired after a successful create (once media uploads finish). Lets a host
  // drawer refresh its list; the form itself stays open showing the receipt.
  onCreated?: () => void;
}

interface GeneralInfo {
  customerType: "new" | "existing";
  clientId: string;
  newClient: { name: string; email: string; phone: string };
  agentId: string;
  responsibleWorkerId: string;
  orderType: OrderType;
  deliveryDate: string;
  deadlineAt: string;
  orderNotes: string;
  route: "factory" | "designer";
  designerId: string;
  designerBrief: string;
}

interface ItemFormState extends OrderItemInput {
  files: File[];
  linksText: string;
}

function parseLinks(linksText: string): string[] {
  return linksText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyGeneral(variant: Variant): GeneralInfo {
  return {
    customerType: "new",
    clientId: "",
    newClient: { name: "", email: "", phone: "" },
    agentId: "",
    responsibleWorkerId: "",
    orderType: "normal",
    deliveryDate: "",
    deadlineAt: "",
    orderNotes: "",
    route: variant === "designer" ? "designer" : "factory",
    designerId: "",
    designerBrief: "",
  };
}

function emptyItem(): ItemFormState {
  return {
    category_id: "",
    product_id: "",
    variant_id: "",
    qty: 1,
    attributes: {},
    item_notes: "",
    files: [],
    linksText: "",
  };
}

function validateGeneral(general: GeneralInfo, variant: Variant): string | null {
  if (general.customerType === "new" && !general.newClient.name.trim()) {
    return "New client name is required.";
  }
  if (general.customerType === "existing" && !general.clientId) {
    return "Select an existing client.";
  }
  if (!general.responsibleWorkerId) {
    return "Pick the worker responsible for this order.";
  }
  if (!general.deliveryDate) return "Delivery date is required.";
  if (general.orderType === "express" && !general.deadlineAt) {
    return "Express orders need a deadline date & time.";
  }
  if (variant === "manager" && general.route === "designer" && !general.designerId) {
    return "Select which designer this order goes to.";
  }
  return null;
}

export function OrderForm({
  variant,
  clients,
  agents,
  catalog,
  workers,
  designers = [],
  onCreate,
  onCheckDuplicates,
  onCreated,
}: OrderFormProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [general, setGeneral] = useState<GeneralInfo>(emptyGeneral(variant));
  const [items, setItems] = useState<ItemFormState[]>([emptyItem()]);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    orderNo: string;
    route: "factory" | "designer";
    routedTo: string | null;
    notes: string[];
    warnings: string[];
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  function patchItem(index: number, patch: Partial<ItemFormState>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function goToItems() {
    const err = validateGeneral(general, variant);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep(2);
  }

  function submit() {
    const generalErr = validateGeneral(general, variant);
    if (generalErr) {
      setError(generalErr);
      setStep(1);
      return;
    }
    const usableItems = items.filter((it) => it.category_id && it.product_id);
    if (usableItems.length === 0) {
      setError("Add at least one item with a product selected.");
      return;
    }

    setError(null);
    setConfirmed(null);
    startTransition(async () => {
      const payload: OrderFormPayload = {
        customerType: general.customerType,
        client_id: general.clientId,
        new_client: general.newClient,
        agent_id: general.agentId,
        responsible_worker_id: general.responsibleWorkerId,
        order_type: general.orderType,
        delivery_date: general.deliveryDate,
        deadline_at: general.deadlineAt,
        order_notes: general.orderNotes,
        route: general.route,
        designer_id: variant === "manager" ? general.designerId : "",
        designer_brief: variant === "manager" ? general.designerBrief : "",
        items: items.map(({ category_id, product_id, variant_id, qty, attributes, item_notes }) => ({
          category_id,
          product_id,
          variant_id,
          qty,
          attributes,
          item_notes,
        })),
      };

      const res = await onCreate(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      const notes: string[] = [...res.warnings];
      const warnings: string[] = [];
      for (const { formIndex, itemId } of res.items) {
        const files = items[formIndex]?.files ?? [];
        for (const file of files) {
          setUploadStatus(`Uploading "${file.name}"…`);
          const uploadRes = await uploadFileToStorage(itemId, file);
          if (!uploadRes.ok) warnings.push(uploadRes.error);
        }

        const links = parseLinks(items[formIndex]?.linksText ?? "");
        for (const link of links) {
          setUploadStatus(`Adding link "${link}"…`);
          const linkRes = await addMediaLink(itemId, link);
          if (!linkRes.ok) warnings.push(linkRes.error);
        }
      }
      setUploadStatus(null);

      const routedTo =
        general.route === "designer"
          ? variant === "designer"
            ? "you"
            : (designers.find((d) => d.id === general.designerId)?.name ?? "the designer")
          : null;
      setConfirmed({ orderNo: res.orderNo, route: general.route, routedTo, notes, warnings });
      setGeneral(emptyGeneral(variant));
      setItems([emptyItem()]);
      setStep(1);
      onCreated?.();
    });
  }

  return (
    <div className="space-y-8">
      {confirmed ? (
        <div className="rounded-[var(--radius)] border border-[var(--normal)]/40 bg-[var(--normal)]/10 p-3 text-sm">
          <p>
            Order <span className="font-semibold tnum">{confirmed.orderNo}</span> created
            {confirmed.route === "designer"
              ? ` — kept with ${confirmed.routedTo} for design work.`
              : " — sent straight to the factory."}
          </p>
          {confirmed.notes.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted">
              {confirmed.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          {confirmed.warnings.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-[var(--rush)]">
              {confirmed.warnings.map((w, i) => (
                <li key={i}>{w} — you can retry this from the order&apos;s page.</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <span className={step === 1 ? "text-brand-600" : ""}>1. General information</span>
        <span>→</span>
        <span className={step === 2 ? "text-brand-600" : ""}>2. Items</span>
      </div>

      {step === 1 ? (
        <GeneralStep
          variant={variant}
          general={general}
          setGeneral={setGeneral}
          clients={clients}
          agents={agents}
          workers={workers}
          designers={designers}
          onCheckDuplicates={onCheckDuplicates}
        />
      ) : (
        <ItemsStep items={items} setItems={setItems} patchItem={patchItem} catalog={catalog} />
      )}

      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
      {uploadStatus ? <p className="text-sm text-muted">{uploadStatus}</p> : null}

      <div className="flex justify-between">
        {step === 2 ? (
          <Button variant="secondary" type="button" onClick={() => setStep(1)} disabled={pending}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {step === 1 ? (
          <Button variant="intake" type="button" onClick={goToItems}>
            Continue to items
          </Button>
        ) : (
          <Button variant="intake" type="button" onClick={submit} disabled={pending}>
            {pending ? "Creating…" : "Create order"}
          </Button>
        )}
      </div>
    </div>
  );
}

function GeneralStep({
  variant,
  general,
  setGeneral,
  clients,
  agents,
  workers,
  designers,
  onCheckDuplicates,
}: {
  variant: Variant;
  general: GeneralInfo;
  setGeneral: (g: GeneralInfo) => void;
  clients: Client[];
  agents: Agent[];
  workers: WorkerPublic[];
  designers: DesignerPublic[];
  onCheckDuplicates: (input: {
    name: string;
    email: string;
    phone: string;
  }) => Promise<{ ok: true; hits: ClientDuplicateHit[] } | { ok: false; error: string }>;
}) {
  return (
    <section className="space-y-4">
      <SectionLabel>Customer</SectionLabel>
      <div className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            className={`rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium ${
              general.customerType === "new" ? "bg-brand-500 text-white" : "border border-border"
            }`}
            onClick={() => setGeneral({ ...general, customerType: "new" })}
          >
            New customer
          </button>
          <button
            type="button"
            className={`rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium ${
              general.customerType === "existing" ? "bg-brand-500 text-white" : "border border-border"
            }`}
            onClick={() => setGeneral({ ...general, customerType: "existing" })}
          >
            Existing client
          </button>
        </div>

        {general.customerType === "new" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <TextInput
                value={general.newClient.name}
                onChange={(e) =>
                  setGeneral({ ...general, newClient: { ...general.newClient, name: e.target.value } })
                }
                required
              />
            </Field>
            <Field label="Email">
              <TextInput
                type="email"
                value={general.newClient.email}
                onChange={(e) =>
                  setGeneral({ ...general, newClient: { ...general.newClient, email: e.target.value } })
                }
              />
            </Field>
            <Field label="Phone">
              <TextInput
                value={general.newClient.phone}
                onChange={(e) =>
                  setGeneral({ ...general, newClient: { ...general.newClient, phone: e.target.value } })
                }
              />
            </Field>
            <DuplicateHint
              newClient={general.newClient}
              onCheckDuplicates={onCheckDuplicates}
              onUseExisting={(id) =>
                setGeneral({
                  ...general,
                  customerType: "existing",
                  clientId: id,
                  newClient: { name: "", email: "", phone: "" },
                })
              }
            />
          </div>
        ) : (
          <ClientPicker
            clients={clients}
            value={general.clientId}
            onChange={(clientId) => setGeneral({ ...general, clientId })}
          />
        )}
      </div>

      <SectionLabel>Order details</SectionLabel>
      <div className="grid gap-4 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs sm:grid-cols-2">
        <Field label="Responsible worker" hint="Who owns this order to start — can be changed later">
          <Select
            value={general.responsibleWorkerId}
            onChange={(e) => setGeneral({ ...general, responsibleWorkerId: e.target.value })}
            required
          >
            <option value="">Select a worker…</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.station ? ` · ${w.station}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Agent (optional)" hint="Who brought this client, if anyone">
          <Select
            value={general.agentId}
            onChange={(e) => setGeneral({ ...general, agentId: e.target.value })}
          >
            <option value="">No agent</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Order type">
          <Select
            value={general.orderType}
            onChange={(e) => setGeneral({ ...general, orderType: e.target.value as OrderType })}
          >
            <option value="normal">Normal</option>
            <option value="express">Express</option>
          </Select>
        </Field>
        <Field label="Delivery date">
          <TextInput
            type="date"
            value={general.deliveryDate}
            onChange={(e) => setGeneral({ ...general, deliveryDate: e.target.value })}
            required
          />
        </Field>
        {general.orderType === "express" ? (
          <Field label="Deadline" hint="Date & time this must be done by">
            <TextInput
              type="datetime-local"
              value={general.deadlineAt}
              onChange={(e) => setGeneral({ ...general, deadlineAt: e.target.value })}
              required
            />
          </Field>
        ) : null}
        <div className="sm:col-span-2">
          <Field label="Order notes">
            <TextInput
              value={general.orderNotes}
              onChange={(e) => setGeneral({ ...general, orderNotes: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <SectionLabel>Routing</SectionLabel>
      <div className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
        {variant === "designer" ? (
          <>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                className={`rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium ${
                  general.route === "designer" ? "bg-brand-500 text-white" : "border border-border"
                }`}
                onClick={() => setGeneral({ ...general, route: "designer" })}
              >
                I&apos;ll design it first
              </button>
              <button
                type="button"
                className={`rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium ${
                  general.route === "factory" ? "bg-brand-500 text-white" : "border border-border"
                }`}
                onClick={() => setGeneral({ ...general, route: "factory" })}
              >
                Send straight to the factory
              </button>
            </div>
            <p className="text-xs text-muted">
              {general.route === "designer"
                ? "This order stays on your board for design work; release items to the factory as you finish."
                : "This order goes onto the factory board immediately — no design step."}
            </p>
          </>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                className={`rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium ${
                  general.route === "factory" ? "bg-brand-500 text-white" : "border border-border"
                }`}
                onClick={() => setGeneral({ ...general, route: "factory" })}
              >
                Send to factory
              </button>
              <button
                type="button"
                className={`rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium ${
                  general.route === "designer" ? "bg-brand-500 text-white" : "border border-border"
                }`}
                onClick={() => setGeneral({ ...general, route: "designer" })}
              >
                Send to graphics designer
              </button>
            </div>

            {general.route === "designer" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Designer">
                  <Select
                    value={general.designerId}
                    onChange={(e) => setGeneral({ ...general, designerId: e.target.value })}
                    required
                  >
                    <option value="">Select a designer…</option>
                    {designers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    label="Brief (optional)"
                    hint="What the designer should do before this reaches the factory"
                  >
                    <TextArea
                      value={general.designerBrief}
                      onChange={(e) => setGeneral({ ...general, designerBrief: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted">
                This order will appear on the factory board immediately.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const MATCH_LABEL: Record<ClientDuplicateHit["reason"], string> = {
  phone: "same phone",
  email: "same email",
  name_exact: "same name",
  name_similar: "similar name",
};

// Live check as the initiator fills in a new customer — surfaces existing
// clients that look like the same person so they can link to one instead of
// creating a duplicate. Debounced; stale responses are ignored.
function DuplicateHint({
  newClient,
  onCheckDuplicates,
  onUseExisting,
}: {
  newClient: { name: string; email: string; phone: string };
  onCheckDuplicates: (input: {
    name: string;
    email: string;
    phone: string;
  }) => Promise<{ ok: true; hits: ClientDuplicateHit[] } | { ok: false; error: string }>;
  onUseExisting: (id: string) => void;
}) {
  const [hits, setHits] = useState<ClientDuplicateHit[]>([]);
  const reqRef = useRef(0);

  const name = newClient.name.trim();
  const email = newClient.email.trim();
  const phone = newClient.phone.trim();

  useEffect(() => {
    const req = ++reqRef.current;
    const enoughToSearch = name.length >= 2 || !!email || !!phone;
    const timer = setTimeout(
      async () => {
        if (!enoughToSearch) {
          if (reqRef.current === req) setHits([]);
          return;
        }
        const res = await onCheckDuplicates({ name, email, phone });
        if (reqRef.current !== req) return;
        setHits(res.ok ? res.hits : []);
      },
      enoughToSearch ? 400 : 0,
    );
    return () => clearTimeout(timer);
  }, [name, email, phone, onCheckDuplicates]);

  if (hits.length === 0) return null;

  return (
    <div className="rounded-[var(--radius)] border border-[var(--urgent)]/40 bg-[var(--urgent)]/10 p-3 text-xs sm:col-span-2">
      <p className="font-medium">
        Possible existing {hits.length === 1 ? "client" : "clients"} — link to one instead of
        creating a duplicate?
      </p>
      <ul className="mt-2 space-y-1.5">
        {hits.map((h) => (
          <li key={h.id} className="flex items-start justify-between gap-3">
            <span>
              <span className="font-medium">{h.name}</span>
              {[h.email, h.phone].filter(Boolean).length > 0 ? (
                <span className="text-muted"> · {[h.email, h.phone].filter(Boolean).join(" · ")}</span>
              ) : null}
              {!h.active ? <span className="text-muted"> · inactive</span> : null}
              <span className="text-muted"> · {MATCH_LABEL[h.reason]}</span>
            </span>
            <button
              type="button"
              className="shrink-0 font-medium text-brand-600"
              onClick={() => onUseExisting(h.id)}
            >
              Use this client
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClientPicker({
  clients,
  value,
  onChange,
}: {
  clients: Client[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = clients.find((c) => c.id === value) ?? null;

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-border px-3 py-2.5 text-sm">
        <div>
          <p className="font-medium">{selected.name}</p>
          {selected.email || selected.phone ? (
            <p className="text-xs text-muted">
              {[selected.email, selected.phone].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <button type="button" className="text-xs text-brand-600" onClick={() => onChange("")}>
          Change
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? clients.filter((c) =>
        [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)),
      )
    : clients;

  return (
    <div>
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clients by name, email, or phone…"
      />
      <div className="mt-1 max-h-40 overflow-y-auto rounded-[var(--radius)] border border-border">
        {filtered.slice(0, 50).map((c) => (
          <button
            key={c.id}
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-background"
            onClick={() => onChange(c.id)}
          >
            <span className="font-medium">{c.name}</span>{" "}
            <span className="text-xs text-muted">
              {[c.email, c.phone].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted">
            No matches — check spelling or add this client as a new customer.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ItemsStep({
  items,
  setItems,
  patchItem,
  catalog,
}: {
  items: ItemFormState[];
  setItems: (fn: (prev: ItemFormState[]) => ItemFormState[]) => void;
  patchItem: (index: number, patch: Partial<ItemFormState>) => void;
  catalog: ProductCategory[];
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Items</SectionLabel>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setItems((prev) => [...prev, emptyItem()])}
        >
          + Add item
        </Button>
      </div>

      <div className="space-y-4">
        {items.map((item, idx) => (
          <ItemRow
            key={idx}
            index={idx}
            item={item}
            catalog={catalog}
            onChange={patchItem}
            onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
            removable={items.length > 1}
          />
        ))}
      </div>
    </section>
  );
}

function ItemRow({
  index,
  item,
  catalog,
  onChange,
  onRemove,
  removable,
}: {
  index: number;
  item: ItemFormState;
  catalog: ProductCategory[];
  onChange: (index: number, patch: Partial<ItemFormState>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const category = catalog.find((c) => c.id === item.category_id) ?? null;
  const products = category?.products ?? [];
  const product = products.find((p) => p.id === item.product_id) ?? null;
  const variants = product?.variants ?? [];
  const attributeDefs = category?.attributes ?? [];

  function patchAttribute(name: string, value: string) {
    onChange(index, { attributes: { ...item.attributes, [name]: value } });
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Item {index + 1}
        </span>
        {removable ? (
          <button type="button" onClick={onRemove} className="text-xs text-[var(--rush)]">
            Remove
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select
            value={item.category_id}
            onChange={(e) =>
              onChange(index, {
                category_id: e.target.value,
                product_id: "",
                variant_id: "",
                attributes: {},
              })
            }
            required
          >
            <option value="">Select a category…</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Product">
          <Select
            value={item.product_id}
            onChange={(e) => onChange(index, { product_id: e.target.value, variant_id: "" })}
            disabled={!category}
            required
          >
            <option value="">{category ? "Select a product…" : "Pick a category first"}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {variants.length > 0 ? (
          <Field label="Variant">
            <Select
              value={item.variant_id}
              onChange={(e) => onChange(index, { variant_id: e.target.value })}
            >
              <option value="">None</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Quantity">
          <TextInput
            type="number"
            min={1}
            className="tnum"
            value={item.qty}
            onChange={(e) => onChange(index, { qty: Number(e.target.value) })}
          />
        </Field>
      </div>

      {attributeDefs.length > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {category?.name} details
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {attributeDefs.map((attr) => (
              <Field key={attr.id} label={attr.required ? attr.name : `${attr.name} (optional)`}>
                {attr.type === "select" ? (
                  <Select
                    value={item.attributes[attr.name] ?? ""}
                    onChange={(e) => patchAttribute(attr.name, e.target.value)}
                    required={attr.required}
                  >
                    <option value="">Select…</option>
                    {(attr.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <TextInput
                    type={attr.type === "number" ? "number" : "text"}
                    value={item.attributes[attr.name] ?? ""}
                    onChange={(e) => patchAttribute(attr.name, e.target.value)}
                    required={attr.required}
                  />
                )}
              </Field>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <Field label="Photos" hint="Uploaded once the order is created">
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="block w-full text-sm"
            onChange={(e) => onChange(index, { files: Array.from(e.target.files ?? []) })}
          />
          {item.files.length > 0 ? (
            <p className="mt-1 text-xs text-muted">{item.files.length} file(s) selected.</p>
          ) : null}
        </Field>
        <Field label="Or paste links" hint="Drive, Dropbox, etc. — one per line">
          <TextArea
            value={item.linksText}
            onChange={(e) => onChange(index, { linksText: e.target.value })}
            placeholder={"https://…"}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Item notes">
            <TextArea
              value={item.item_notes}
              onChange={(e) => onChange(index, { item_notes: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
