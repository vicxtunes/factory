// What a client sends when they ask a studio for a product online, what it
// becomes, and the limits on it. Pure.

import { z } from "zod";

import { requesterNameSchema, requesterPhoneSchema } from "@repo/lib/booking-requests/core";

/** Requests a client may have waiting at one studio at once, so a form can't flood a studio. */
export const MAX_OPEN_PRODUCT_REQUESTS = 3;

/** Files one order can hold; a bigger set goes by link (Drive, Dropbox…). */
export const MAX_ORDER_MEDIA = 100;

export type ProductRequestStatus = "requested" | "confirmed" | "declined";

export const PRODUCT_REQUEST_STATUS_LABELS: Record<ProductRequestStatus, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  declined: "Declined",
};

/** A photo or file the client sent to make their order from, or a link to them. */
export interface ProductRequestMedia {
  id: string;
  fileName: string;
  /** Where it's stored; null for a pasted link. */
  storagePath: string | null;
  mimeType: string | null;
  url: string;
}

/** A product a client asked for: the size's name and price as they were then. */
export interface ProductRequest {
  id: string;
  customerId: string;
  customerName: string;
  offeringId: string;
  /** "Photobook · 8x12". */
  itemName: string;
  quantity: number;
  /** Each; 0 = priced on request. */
  unitPrice: number;
  status: ProductRequestStatus;
  /** The quotation made when it was asked for (none when priced on request). */
  quotationId: string | null;
  /** The invoice made when it was paid for or confirmed. */
  invoiceId: string | null;
  createdAt: string;
  /** What they sent to make it from. An order can't be paid for without any. */
  media: ProductRequestMedia[];
}

export const productRequestIdSchema = z.uuid("That request doesn't exist.");

/** "Order now": the size and how many; who they are unless they're signed in at the studio. */
export const orderNowSchema = z.object({
  productSlug: z.string().trim().min(1).max(90),
  packageId: z.uuid("Choose a size."),
  quantity: z.coerce.number("How many?").int("How many?").min(1, "At least 1.").max(99, "At most 99 at once."),
  name: requesterNameSchema,
  phone: requesterPhoneSchema,
});

/** As the schema gives it: the phone in its stored form, or absent. */
export type OrderNowInput = Omit<z.infer<typeof orderNowSchema>, "phone"> & { phone?: string };

/** A pasted link to the client's photos. */
export const orderLinkSchema = z
  .string()
  .trim()
  .max(2000, "That link is too long.")
  .regex(/^https?:\/\/\S+$/i, "Paste the full link, starting with https://");

/** Photos and PDFs only: the bucket is public, so nothing a browser would run. */
export const isOrderFileType = (mimeType: string | null | undefined): boolean => !!mimeType && (mimeType === "application/pdf" || (mimeType.startsWith("image/") && mimeType !== "image/svg+xml"));

/** The folder an order's uploads go in; an upload outside it is refused. */
export const orderMediaFolder = (tenantId: string, requestId: string): string => `product-requests/${tenantId}/${requestId}`;

/** Whether `path` is a file directly in that folder. */
export const isOrderMediaPath = (path: string, tenantId: string, requestId: string): boolean => {
  const folder = `${orderMediaFolder(tenantId, requestId)}/`;
  return path.startsWith(folder) && path.length > folder.length && !path.slice(folder.length).includes("/") && !path.includes("..");
};

/** What happened: the request, and whether this device is now signed in to the client's page. */
export interface OrderNowOutcome {
  requestId: string;
  signedIn: boolean;
}
