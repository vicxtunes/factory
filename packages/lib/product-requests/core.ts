// What a client sends when they ask a studio for a product online, what it
// becomes, and the limits on it. Pure.

import { z } from "zod";

import { requesterNameSchema, requesterPhoneSchema } from "@repo/lib/booking-requests/core";

/** Requests a client may have waiting at one studio at once, so a form can't flood a studio. */
export const MAX_OPEN_PRODUCT_REQUESTS = 3;

export type ProductRequestStatus = "requested" | "confirmed" | "declined";

export const PRODUCT_REQUEST_STATUS_LABELS: Record<ProductRequestStatus, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  declined: "Declined",
};

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
  /** The invoice made when it was confirmed. */
  invoiceId: string | null;
  createdAt: string;
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

/** What happened: the request, and whether this device is now signed in to the client's page. */
export interface OrderNowOutcome {
  requestId: string;
  signedIn: boolean;
}
