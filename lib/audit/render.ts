import { STATUS_LABELS, type OrderAuditEntry, type ProductionStatus } from "@/lib/types";

// Plain-English clauses for the "Show logs" timeline — no diffs, no JSON, no
// field names a non-technical reader wouldn't recognize. One entry per
// `action` written by lib/audit/log.ts's call sites.
const ACTION_TEMPLATES: Record<string, (d: Record<string, unknown>) => string> = {
  order_created: (d) => `created this order${d.clientName ? ` for ${d.clientName}` : ""}`,
  item_reassigned: (d) =>
    d.toWorker
      ? `assigned ${str(d.itemLabel)} to ${str(d.toWorker)}`
      : `unassigned ${str(d.itemLabel)}`,
  status_overridden: (d) => `changed ${str(d.itemLabel)}'s status to ${statusLabel(d.to)}`,
  status_advanced: (d) => `advanced ${str(d.itemLabel)} to ${statusLabel(d.to)}`,
  delay_flagged: (d) => `flagged ${str(d.itemLabel)} as delayed — "${str(d.reason)}"`,
  delay_cleared: (d) => `cleared the delay on ${str(d.itemLabel)}`,
  item_sent_to_factory: (d) => `sent ${str(d.itemLabel)} to the factory`,
  order_released_to_factory: (d) =>
    `released the rest of the order to the factory (${str(d.count)} item${d.count === 1 ? "" : "s"})`,
  order_details_updated: (d) => `updated the order's ${str(d.field)} to "${str(d.to)}"`,
  item_details_updated: (d) => `updated ${str(d.itemLabel)}'s ${str(d.field)} to "${str(d.to)}"`,
  photo_uploaded: (d) => `added a photo to ${str(d.itemLabel)}${d.fileName ? ` (${str(d.fileName)})` : ""}`,
  link_added: (d) => `added a link to ${str(d.itemLabel)}`,
  media_removed: (d) => `removed a photo/link from ${str(d.itemLabel)}`,
  media_replaced: (d) => `replaced a photo/link on ${str(d.itemLabel)}`,
  note_added: (d) => (d.itemLabel ? `added a note on ${str(d.itemLabel)}` : "added a note on the order"),
  note_edited: () => "edited their note",
  note_removed: () => "removed their note",
  order_cancelled: (d) => `cancelled this order — "${str(d.reason)}"`,
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function statusLabel(v: unknown): string {
  const key = String(v ?? "") as ProductionStatus;
  return STATUS_LABELS[key] ?? str(v);
}

const ROLE_LABELS: Record<string, string> = {
  boss: "Boss",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
};

function actorLabel(entry: OrderAuditEntry): string {
  if (entry.actor_type === "dashboard_user") {
    const role = entry.actor_role ? ROLE_LABELS[entry.actor_role] : null;
    return role ? `${entry.actor_name} (${role})` : entry.actor_name;
  }
  if (entry.actor_type === "designer") return `${entry.actor_name} (Designer)`;
  return `${entry.actor_name} (Worker)`;
}

export function renderAuditEntry(entry: OrderAuditEntry): { who: string; what: string; when: string } {
  const template = ACTION_TEMPLATES[entry.action];
  const what = template ? template(entry.detail) : entry.action.replace(/_/g, " ");
  return {
    who: actorLabel(entry),
    what,
    when: new Date(entry.created_at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}
