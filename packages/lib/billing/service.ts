// Quotation use cases over a QuotationStore and a BillingDirectory. No
// database or framework code, so it runs on any store (tests use in-memory
// ones, ./service.test.ts). Studio callers find the tenant from the session
// and parse the input first; link callers pass only the token.

import { localDate } from "@repo/lib/accounting/core/period";
import { validateLineDiscount } from "@repo/lib/discounts/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  canEditQuotation,
  canRespondToQuotation,
  priceLine,
  quotationStatus,
  totalsOf,
  type Issuer,
  type LineInput,
  type Quotation,
  type QuotationInput,
  type QuotationSummary,
} from "./core";
import type { QuotationResponseInput } from "./core/schema";
import { BillingError, type BillingDirectory, type QuotationRecord, type QuotationStore } from "./ports";

const GONE = "That quotation no longer exists.";

export class QuotationService {
  constructor(
    private readonly store: QuotationStore,
    private readonly directory: BillingDirectory,
    private readonly newToken: () => string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Newest first; `customerId` narrows to one customer's. */
  async list(scope: TenantScope, customerId?: string): Promise<QuotationSummary[]> {
    const today = this.today(scope);
    return (await this.store.list(scope, { customerId })).map((r) => summaryOf(r, today));
  }

  async get(scope: TenantScope, id: string): Promise<Quotation | null> {
    const record = await this.store.get(scope, id);
    return record ? quotationOf(record, this.today(scope)) : null;
  }

  async create(scope: TenantScope, input: QuotationInput): Promise<string> {
    await this.check(scope, input, null);
    return this.store.save(scope, null, input, this.totalOf(input), this.newToken());
  }

  /** Changes an unanswered quotation (an expired one too, e.g. to give it a new date). */
  async update(scope: TenantScope, id: string, input: QuotationInput): Promise<string> {
    const current = await this.get(scope, id);
    if (!current) throw new BillingError(GONE);
    if (!canEditQuotation(current.status)) throw new BillingError("This quotation has been answered, so it can't be changed.");
    await this.check(scope, input, current.customerId);
    return this.store.save(scope, id, input, this.totalOf(input), current.shareToken);
  }

  /** A new link; the old one stops working. */
  async resetLink(scope: TenantScope, id: string): Promise<void> {
    if (!(await this.store.resetToken(scope, id, this.newToken()))) throw new BillingError(GONE);
  }

  /** What the link shows: the quotation and who issued it. Null for an unknown link. */
  async byLink(token: string): Promise<{ quotation: Quotation; issuer: Issuer; scope: TenantScope } | null> {
    const found = await this.store.byToken(token);
    if (!found) return null;
    const business = await this.directory.issuer(found.tenantId);
    if (!business) return null;
    return { quotation: quotationOf(found.quotation, this.today(business.scope)), issuer: business.issuer, scope: business.scope };
  }

  /** The customer's answer through the link. Only while it's open and in date. */
  async respond(token: string, answer: QuotationResponseInput): Promise<void> {
    const found = await this.byLink(token);
    if (!found) throw new BillingError("This link isn't valid any more. Ask for a new one.");
    const { quotation, scope } = found;
    if (!canRespondToQuotation(quotation.status)) {
      throw new BillingError(
        quotation.status === "expired" ? "This quotation has expired. Ask for an updated one." : "This quotation has already been answered.",
      );
    }
    const decision = answer.decision === "accept" ? "accepted" : "declined";
    const recorded = await this.store.respond(scope.tenantId, quotation.id, decision, decision === "declined" ? answer.reason : null);
    if (!recorded) throw new BillingError("This quotation has already been answered.");
  }

  private async check(scope: TenantScope, input: QuotationInput, currentCustomerId: string | null): Promise<void> {
    const customer = await this.directory.customer(scope, input.customerId);
    if (!customer) throw new BillingError("That client no longer exists.");
    if (customer.archived && input.customerId !== currentCustomerId) throw new BillingError("That client is archived. Restore them first.");
    if (input.validUntil && input.validUntil < this.today(scope)) throw new BillingError("The valid-until date has already passed.");
    input.lines.forEach((line, i) => {
      const problem = lineProblem(line);
      if (problem) throw new BillingError(input.lines.length > 1 ? `Line ${i + 1}: ${problem}` : problem);
    });
  }

  private totalOf(input: QuotationInput): number {
    return totalsOf(input.lines.map(priceLine)).total;
  }

  private today(scope: TenantScope): string {
    return localDate(this.clock(), scope.timeZone);
  }
}

function lineProblem(line: LineInput): string | null {
  if (!line.discount) return null;
  const [problem] = validateLineDiscount(line.discount);
  if (problem) return problem;
  if (line.discount.kind === "amount" && line.discount.value > line.unitPrice) return "The discount can't be more than the price.";
  return null;
}

function summaryOf(r: QuotationRecord, today: string): QuotationSummary {
  return {
    id: r.id,
    number: r.number,
    customerId: r.customerId,
    billTo: r.billTo,
    issuedAt: r.issuedAt,
    validUntil: r.validUntil,
    status: quotationStatus({ status: r.response, validUntil: r.validUntil }, today),
    total: r.total,
  };
}

function quotationOf(r: QuotationRecord & { lines: LineInput[] }, today: string): Quotation {
  const lines = r.lines.map(priceLine);
  return {
    ...summaryOf(r, today),
    ...totalsOf(lines),
    notes: r.notes,
    respondedAt: r.respondedAt,
    declineReason: r.declineReason,
    shareToken: r.shareToken,
    lines,
  };
}
