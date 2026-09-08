// Hand-written DB row types. Regenerate with:
//   npx supabase gen types typescript --linked > lib/database.types.ts
// and swap these for the generated `Database` type once the project is linked.

export type Urgency = "normal" | "urgent" | "rush";

export type OrderType = "normal" | "express";

export type AttributeType = "text" | "number" | "select";

export type ProductionStatus =
  | "not_started"
  | "in_production"
  | "quality_check"
  | "ready_for_pickup"
  | "completed";

export type NotificationEvent = "completed" | "delayed";

export type AppRole = "supervisor" | "boss";

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
  order_notes: string | null;
  media_link: string | null;
  media_notes: string | null;
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
  item_notes: string | null;
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
  drive_file_id: string;
  web_view_link: string;
  uploaded_at: string;
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

export interface NotificationRow {
  id: string;
  order_item_id: string;
  event_type: NotificationEvent;
  message: string;
  created_at: string;
}

export interface Station {
  id: string;
  name: string;
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
  order: Pick<
    Order,
    | "order_no"
    | "client_name"
    | "delivery_date"
    | "status"
    | "media_link"
    | "media_notes"
    | "order_type"
    | "deadline_at"
    | "agent_name"
  >;
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
  completed: "Completed",
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

// Order-at-factory status that gates what appears on the production board.
export const FACTORY_ORDER_STATUS = "At Factory";
