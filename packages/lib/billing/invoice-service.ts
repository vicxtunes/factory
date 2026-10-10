// Invoice, payment and receipt use cases over an InvoiceStore (and the
// QuotationStore, to turn an accepted quotation into an invoice). No database
// or framework code, so it runs on any store (./invoice-service.test.ts).
// Studio callers find the tenant from the session and parse the input first;
// link callers pass only the token.

import { localDate } from "@repo/lib/accounting/core/period";
import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  canEditInvoice,
  canRecordPayment,
  canVoidInvoice,
  invoiceBalance,
  invoiceStatus,
  linesProblem,
  priceLine,
  totalsOf,
  type Invoice,
  type InvoiceInput,
  type InvoiceSummary,
  type Issuer,
  type LineInput,
  type Shoot,
  type PaymentInput,
  type Receipt,
} from "./core";
import { BillingError, type BillingDirectory, type InvoiceRecord, type InvoiceStore, type QuotationStore } from "./ports";

const GONE = "That invoice no longer exists.";

export class InvoiceService {
  constructor(
    private readonly store: InvoiceStore,
    private readonly quotations: QuotationStore,
    private readonly directory: BillingDirectory,
    private readonly newToken: () => string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Newest first; `customerId` narrows to one customer's. */
  async list(scope: TenantScope, customerId?: string): Promise<InvoiceSummary[]> {
    const today = this.today(scope);
    return (await this.store.list(scope, { customerId })).map((r) => summaryOf(r, today));
  }

  /** What a customer still owes across their invoices. */
  async outstanding(scope: TenantScope, customerId: string): Promise<number> {
    return (await this.list(scope, customerId)).reduce((sum, i) => sum + i.balance, 0);
  }

  async get(scope: TenantScope, id: string): Promise<Invoice | null> {
    const record = await this.store.get(scope, id);
    return record ? invoiceOf(record, this.today(scope)) : null;
  }

  async create(scope: TenantScope, input: InvoiceInput): Promise<string> {
    await this.check(scope, input, null);
    return this.store.save(scope, null, input, this.totalOf(input.lines), this.newToken(), null);
  }

  /** Changes an invoice until it's void, payments or not. */
  async update(scope: TenantScope, id: string, input: InvoiceInput): Promise<string> {
    const current = await this.get(scope, id);
    if (!current) throw new BillingError(GONE);
    if (!canEditInvoice({ voided: !!current.voidedAt, paid: current.paid })) throw new BillingError("This invoice is void.");
    await this.check(scope, input, current.customerId);
    return this.store.save(scope, id, input, this.totalOf(input.lines), current.shareToken, current.sourceId);
  }

  /** The invoice made from a quotation, if any. */
  async idForQuotation(scope: TenantScope, quotationId: string): Promise<string | null> {
    return this.store.idForQuotation(scope, quotationId);
  }

  /**
   * The invoice for an accepted quotation: made with one tap from its client
   * and lines (no re-typing), or the one already made from it.
   */
  async fromQuotation(scope: TenantScope, quotationId: string): Promise<string> {
    const existing = await this.store.idForQuotation(scope, quotationId);
    if (existing) return existing;
    const quotation = await this.quotations.get(scope, quotationId);
    if (!quotation) throw new BillingError("That quotation no longer exists.");
    if (quotation.response !== "accepted") throw new BillingError("Only an accepted quotation can become an invoice.");
    const input: InvoiceInput = { customerId: quotation.customerId, dueDate: null, shoot: quotation.shoot, notes: quotation.notes, lines: quotation.lines };
    return this.store.save(scope, null, input, this.totalOf(input.lines), this.newToken(), quotation.id);
  }

  /** Records money received. Never more than what's left, never in the future. */
  async recordPayment(scope: TenantScope, invoiceId: string, input: PaymentInput): Promise<string> {
    const invoice = await this.get(scope, invoiceId);
    if (!invoice) throw new BillingError(GONE);
    if (!canRecordPayment({ voided: !!invoice.voidedAt, balance: invoice.balance })) {
      throw new BillingError(invoice.voidedAt ? "This invoice is void." : "This invoice is already paid in full.");
    }
    if (input.amount > invoice.balance) throw new BillingError("That's more than what's left to pay on this invoice.");
    if (input.receivedOn > this.today(scope)) throw new BillingError("The payment date can't be in the future.");
    return this.store.recordPayment(scope, invoiceId, input, this.newToken());
  }

  /** Takes a mistaken payment out of the totals. It stays in the history with the reason. */
  async voidPayment(scope: TenantScope, paymentId: string, reason: string): Promise<void> {
    if (!(await this.store.voidPayment(scope, paymentId, reason))) throw new BillingError("That payment no longer exists or is already void.");
  }

  /** Cancels an invoice that has no payments. */
  async voidInvoice(scope: TenantScope, id: string, reason: string): Promise<void> {
    const invoice = await this.get(scope, id);
    if (!invoice) throw new BillingError(GONE);
    if (!canVoidInvoice({ voided: !!invoice.voidedAt, paid: invoice.paid })) {
      throw new BillingError(invoice.voidedAt ? "This invoice is already void." : "This invoice has payments. Void them first.");
    }
    await this.store.voidInvoice(scope, id, reason);
  }

  /** A new link; the old one stops working. */
  /** When its shoot is now: its booking was moved, and the invoice says so. */
  async setShoot(scope: TenantScope, id: string, shoot: Shoot | null): Promise<void> {
    await this.store.setShoot(scope, id, shoot);
  }

  async resetLink(scope: TenantScope, id: string): Promise<void> {
    if (!(await this.store.resetToken(scope, id, this.newToken()))) throw new BillingError(GONE);
  }

  /** What the invoice link shows. Null for an unknown link. */
  async byLink(token: string): Promise<{ invoice: Invoice; issuer: Issuer; scope: TenantScope } | null> {
    const found = await this.store.byToken(token);
    if (!found) return null;
    const business = await this.directory.issuer(found.tenantId);
    if (!business) return null;
    return { invoice: invoiceOf(found.invoice, this.today(business.scope)), issuer: business.issuer, scope: business.scope };
  }

  /** What a receipt link shows. Null for an unknown link. */
  async receiptByLink(token: string): Promise<{ receipt: Receipt; issuer: Issuer; scope: TenantScope } | null> {
    const found = await this.store.receiptByToken(token);
    if (!found) return null;
    const business = await this.directory.issuer(found.tenantId);
    if (!business) return null;
    return { receipt: { payment: found.payment, invoice: summaryOf(found.invoice, this.today(business.scope)) }, issuer: business.issuer, scope: business.scope };
  }

  private async check(scope: TenantScope, input: InvoiceInput, currentCustomerId: string | null): Promise<void> {
    const customer = await this.directory.customer(scope, input.customerId);
    if (!customer) throw new BillingError("That client no longer exists.");
    if (customer.archived && input.customerId !== currentCustomerId) throw new BillingError("That client is archived. Restore them first.");
    const problem = linesProblem(input.lines);
    if (problem) throw new BillingError(problem);
  }

  private totalOf(lines: LineInput[]): number {
    return totalsOf(lines.map(priceLine)).total;
  }

  private today(scope: TenantScope): string {
    return localDate(this.clock(), scope.timeZone);
  }
}

function summaryOf(r: InvoiceRecord, today: string): InvoiceSummary {
  const voided = r.voidedAt !== null;
  const { paid, balance } = invoiceBalance({ total: r.total, voided }, r.payments);
  return {
    id: r.id,
    number: r.number,
    customerId: r.customerId,
    billTo: r.billTo,
    issuedAt: r.issuedAt,
    dueDate: r.dueDate,
    status: invoiceStatus({ voided, dueDate: r.dueDate, total: r.total, paid }, today),
    total: r.total,
    paid,
    balance,
  };
}

function invoiceOf(r: InvoiceRecord & { lines: LineInput[] }, today: string): Invoice {
  const lines = r.lines.map(priceLine);
  return {
    ...summaryOf(r, today),
    ...totalsOf(lines),
    shoot: r.shoot,
    notes: r.notes,
    sourceId: r.sourceId,
    voidedAt: r.voidedAt,
    voidReason: r.voidReason,
    shareToken: r.shareToken,
    lines,
    payments: [...r.payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
