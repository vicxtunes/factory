// Hand-written DB row types. Regenerate with:
//   npx supabase gen types typescript --linked > lib/database.types.ts
// and swap these for the generated `Database` type once the project is linked.

export type Urgency = "normal" | "urgent" | "rush";

export type OrderType = "normal" | "express";

export type OrderStage = "with_designer" | "factory";

export type AttributeType = "text" | "number" | "select";

export type ProductionStatus =
  | "not_started"
  | "in_production"
  | "quality_check"
  | "ready_for_pickup"
  | "completed";

export type NotificationEvent = "completed" | "delayed";

export type AppRole = "supervisor" | "boss" | "receptionist";

// Receptionist and supervisor share full CRUD access across the dashboard.
// Boss is the super-admin: full CRUD everywhere PLUS the admins panel
// (create users, reset passwords, change roles) — gated via requireRole("boss").
export function isManagerRole(role: AppRole): boolean {
  return role === "supervisor" || role === "receptionist" || role === "boss";
}

// Receptionist is the data-entry role (orders, clients, agents) and does
// NOT get worker login-credential actions — setting a worker's initial PIN,
// resetting a PIN, or activating/deactivating a worker's account. Those stay
// with supervisor and boss, gated via requireWorkerSecurity().
export function canManageWorkerSecurity(role: AppRole): boolean {
  return role === "supervisor" || role === "boss";
}

// The order-level "Show logs" audit trail is boss-only for now — written so
// another role can be added later with a one-line change here.
export function canViewOrderAudit(role: AppRole): boolean {
  return role === "boss";
}

export interface Order {
  id: string;
  order_no: string;
  client_name: string;
  client_id: string | null;
  client_email: string | null;
  client_phone: string | null;
  agent_id: string | null;
  agent_name: string | null;
  order_type: OrderType;
  delivery_date: string | null;
  deadline_at: string | null;
  status: string;
  stage: OrderStage;
  assigned_designer_id: string | null;
  designer_name: string | null;
  designer_brief: string | null;
  media_link: string | null;
  media_notes: string | null;
  created_by_name: string | null;
  created_by_role: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product: string;
  product_type: string | null;
  category_id: string | null;
  product_id: string | null;
  variant_id: string | null;
  attributes: Record<string, string | number>;
  qty: number;
  size: string | null;
  cover_type: string | null;
  lamination_type: string | null;
  box_type: string | null;
  urgency: Urgency;
  stage: OrderStage;
  production_status: ProductionStatus;
  is_delayed: boolean;
  delay_reason: string | null;
  assigned_worker_id: string | null;
  media_link: string | null;
  updated_by_worker_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemMedia {
  id: string;
  order_item_id: string;
  file_name: string;
  mime_type: string | null;
  cloudinary_public_id: string | null;
  storage_path: string | null;
  secure_url: string;
  uploaded_at: string;
  uploaded_by_type: AuditActorType | null;
  uploaded_by_id: string | null;
  uploaded_by_name: string | null;
  uploaded_by_role: string | null;
}

export interface OrderNote {
  id: string;
  order_id: string;
  order_item_id: string | null;
  author_type: AuditActorType;
  author_id: string | null;
  author_name: string;
  author_role: string | null;
  body: string;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface CategoryAttribute {
  id: string;
  category_id: string;
  name: string;
  type: AttributeType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  active: boolean;
  created_at: string;
  variants: ProductVariant[];
}

export interface ProductCategory {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  attributes: CategoryAttribute[];
  products: Product[];
}

export interface WorkerPublic {
  id: string;
  name: string;
  station: string | null;
  active: boolean;
}

export interface Worker extends WorkerPublic {
  pin_hash: string;
  created_at: string;
}

export interface DesignerPublic {
  id: string;
  name: string;
  active: boolean;
}

export interface Designer extends DesignerPublic {
  pin_hash: string;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  order_item_id: string;
  event_type: NotificationEvent;
  message: string;
  created_at: string;
}

export type SupportReportStatus = "open" | "resolved";

export interface SupportReport {
  id: string;
  author_type: AuditActorType;
  author_id: string;
  author_name: string;
  author_role: string | null;
  body: string;
  status: SupportReportStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface Station {
  id: string;
  name: string;
  created_at: string;
}

export type AuditActorType = "dashboard_user" | "worker" | "designer" | "system";

export interface OrderAuditEntry {
  id: string;
  order_id: string;
  order_item_id: string | null;
  actor_type: AuditActorType;
  actor_name: string;
  actor_role: string | null;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface Profile {
  id: string;
  role: AppRole;
  full_name: string | null;
  created_at: string;
}

// Joined shape used by the factory board and dashboard list.
export interface OrderItemWithOrder extends OrderItem {
  media: OrderItemMedia[];
  item_notes: OrderNote[];
  order: Pick<
    Order,
    | "order_no"
    | "client_name"
    | "delivery_date"
    | "status"
    | "stage"
    | "assigned_designer_id"
    | "designer_name"
    | "designer_brief"
    | "media_link"
    | "media_notes"
    | "order_type"
    | "deadline_at"
    | "agent_name"
    | "created_at"
    | "created_by_name"
    | "created_by_role"
  > & {
    // Every order_notes row for the order — both order-level (order_item_id
    // null) and item-level. Card badges filter to what they need; the drawer
    // just needs the order-level slice. Fetched here rather than per-item to
    // avoid an extra round trip when the card badge shows order notes too.
    order_notes: OrderNote[];
  };
}

export const PRODUCTION_STATUSES: ProductionStatus[] = [
  "not_started",
  "in_production",
  "quality_check",
  "ready_for_pickup",
  "completed",
];

export const STATUS_LABELS: Record<ProductionStatus, string> = {
  not_started: "Not Started",
  in_production: "In Production",
  quality_check: "Quality Check",
  ready_for_pickup: "Ready",
  completed: "Delivered",
};

// Columns shown on the factory kanban (completed handled separately).
export const BOARD_COLUMNS: ProductionStatus[] = [
  "not_started",
  "in_production",
  "quality_check",
  "ready_for_pickup",
];

export const URGENCY_LABELS: Record<Urgency, string> = {
  normal: "Normal",
  urgent: "Urgent",
  rush: "Rush",
};
