import type { OrderItem } from "@/lib/types";

type AttributeSource = Pick<
  OrderItem,
  "attributes" | "size" | "cover_type" | "lamination_type" | "box_type"
>;

// Renders an item's category-specific details. New orders store these as a
// generic {label: value} map (driven by the supervisor's attribute builder,
// so this component never hardcodes a product category); orders created
// before this existed fall back to the legacy discrete columns.
export function ItemAttributes({ item }: { item: AttributeSource }) {
  const entries = Object.entries(item.attributes ?? {});

  if (entries.length > 0) {
    return (
      <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius)] border border-border p-3 text-xs text-muted">
        {entries.map(([label, value]) => (
          <div key={label}>
            <dt className="uppercase tracking-wide">{label}</dt>
            <dd className="text-foreground">{String(value)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  if (item.size || item.cover_type || item.lamination_type || item.box_type) {
    return (
      <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius)] border border-border p-3 text-xs text-muted">
        <div>
          <dt className="uppercase tracking-wide">Size</dt>
          <dd className="text-foreground">{item.size ?? "—"}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Cover</dt>
          <dd className="text-foreground">{item.cover_type ?? "—"}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Lamination</dt>
          <dd className="text-foreground">{item.lamination_type ?? "—"}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Box</dt>
          <dd className="text-foreground">{item.box_type ?? "—"}</dd>
        </div>
      </dl>
    );
  }

  return null;
}
