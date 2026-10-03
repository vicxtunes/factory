// The studio-orders module's records. Pure; safe on client and server.
//
// The bridge between a studio's projects and the orders its owner places
// with Aming. The orders themselves are Aming's; this module only knows that
// an order has items, how far along it is, and which project it's for.

export interface LinkedOrderItem {
  product: string;
  qty: number;
  /** How far along it is, in the words the client already sees ("Production", "Ready for delivery"…). */
  progress: string;
}

export interface LinkedOrder {
  orderId: string;
  orderNo: string;
  placedAt: string;
  /** The day it's due, "yyyy-mm-dd". */
  deliveryDate: string | null;
  items: LinkedOrderItem[];
  /** The least advanced item's progress: the order is as far along as its slowest item. */
  progress: string;
  /** Every item delivered. */
  finished: boolean;
  cancelled: boolean;
  projectId: string;
  projectTitle: string;
}

/** An order the owner placed that isn't linked to a project yet. */
export interface OrderChoice {
  orderId: string;
  orderNo: string;
  placedAt: string;
  /** "2 × A4 prints, Photobook". */
  summary: string;
}
