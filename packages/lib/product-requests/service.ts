// Asking a studio for a product online, and the studio answering. This
// module only orchestrates: the work is the other modules' (offerings,
// customers, billing, studio-portal) and its own table, reached through the
// narrow ProductRequestDeps so the rules can be tested with fakes
// (./service.test.ts). See ./README.md.

import type { InvoiceInput } from "@repo/lib/billing/core";
import { AppError } from "@repo/lib/kernel/core";
import { offeringLabel, type ServiceWithPackages } from "@repo/lib/offerings/core";
import type { PortalSession } from "@repo/lib/studio-portal/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { MAX_OPEN_PRODUCT_REQUESTS, type OrderNowInput, type OrderNowOutcome, type ProductRequest } from "./core";

/** A problem the person should see (the message is safe to show). */
export class ProductRequestError extends AppError {}

export interface ProductRequestDeps {
  /** A product on sale by its address, with its sizes on sale. */
  product(scope: TenantScope, slug: string): Promise<ServiceWithPackages | null>;
  /** Adds a client, or finds the one who already has this phone number. */
  client(scope: TenantScope, input: { name: string; phone: string }): Promise<{ id: string; isNew: boolean }>;
  /** The client's requests still waiting for an answer. */
  openRequests(scope: TenantScope, customerId: string): Promise<number>;
  request(scope: TenantScope, id: string): Promise<ProductRequest | null>;
  createRequest(scope: TenantScope, input: Pick<ProductRequest, "customerId" | "offeringId" | "itemName" | "quantity" | "unitPrice">): Promise<string>;
  /** requested → confirmed or declined, once. False when it was already answered. */
  answer(scope: TenantScope, id: string, status: "confirmed" | "declined"): Promise<boolean>;
  createInvoice(scope: TenantScope, input: InvoiceInput): Promise<string>;
  linkInvoice(scope: TenantScope, requestId: string, invoiceId: string): Promise<void>;
  /** Signs this device in to the client's page, no PIN. */
  openDevice(tenantId: string, customerId: string): Promise<PortalSession>;
  /** Tells the studio's owner (a push notification). Best effort. */
  notifyOwner(scope: TenantScope, message: { title: string; body: string }): Promise<void>;
  today(scope: TenantScope): string;
}

export class ProductRequestService {
  constructor(private readonly deps: ProductRequestDeps) {}

  /**
   * A client asks for a product from its page, as for a booking: signed in
   * at the studio, as themselves; otherwise by name and phone, a new client
   * added and this device signed in to their page (`session`), a number the
   * studio already knows asking without signing anything in.
   */
  async request(scope: TenantScope, input: OrderNowInput, signedInAs: string | null): Promise<OrderNowOutcome & { session: PortalSession | null }> {
    const product = await this.deps.product(scope, input.productSlug);
    if (!product) throw new ProductRequestError("This product is no longer offered.");
    const size = product.packages.find((p) => p.id === input.packageId);
    if (!size) throw new ProductRequestError("That size is no longer offered. Choose another.");

    let customerId = signedInAs;
    let isNew = false;
    if (!customerId) {
      if (!input.name) throw new ProductRequestError("Enter your name.");
      if (!input.phone) throw new ProductRequestError("Enter your phone number.");
      ({ id: customerId, isNew } = await this.deps.client(scope, { name: input.name, phone: input.phone }));
    }
    if ((await this.deps.openRequests(scope, customerId)) >= MAX_OPEN_PRODUCT_REQUESTS) {
      throw new ProductRequestError("You already have orders waiting for this studio's answer. They'll be in touch soon.");
    }

    const itemName = offeringLabel(size);
    const requestId = await this.deps.createRequest(scope, { customerId, offeringId: size.id, itemName, quantity: input.quantity, unitPrice: size.price });
    await this.deps.notifyOwner(scope, { title: "New order request", body: `${input.quantity} × ${itemName}` });
    const session = isNew ? await this.deps.openDevice(scope.tenantId, customerId) : null;
    return { requestId, signedIn: !!signedInAs || !!session, session };
  }

  /**
   * The studio confirms a client's request and its invoice is made (none for
   * a size priced 0: it's priced on request). Safe to repeat: a request
   * confirmed before gets its invoice if it's still missing.
   */
  async confirm(scope: TenantScope, id: string): Promise<{ invoiceId: string | null }> {
    const request = await this.deps.request(scope, id);
    if (!request) throw new ProductRequestError("That request no longer exists.");
    if (request.status === "requested") await this.deps.answer(scope, id, "confirmed");
    else if (request.status !== "confirmed") throw new ProductRequestError("This request has already been answered.");

    if (request.invoiceId || !request.unitPrice) return { invoiceId: request.invoiceId };
    const invoiceId = await this.deps.createInvoice(scope, {
      customerId: request.customerId,
      dueDate: this.deps.today(scope),
      shoot: null,
      notes: "Ordered online.",
      lines: [{ offeringId: request.offeringId, description: request.itemName, inclusions: [], quantity: request.quantity, unitPrice: request.unitPrice, discount: null }],
    });
    await this.deps.linkInvoice(scope, id, invoiceId);
    return { invoiceId };
  }

  /** The studio declines a client's request. */
  async decline(scope: TenantScope, id: string): Promise<void> {
    const request = await this.deps.request(scope, id);
    if (!request) throw new ProductRequestError("That request no longer exists.");
    if (request.status !== "requested" || !(await this.deps.answer(scope, id, "declined"))) {
      throw new ProductRequestError("This request has already been answered.");
    }
  }
}
