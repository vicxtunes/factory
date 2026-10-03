// Business rules for a document's lines, shared by quotations and invoices. Pure.

import { validateLineDiscount } from "@repo/lib/discounts/core";

import type { LineInput } from "./model";

/** What's wrong with a line's discount, as a sentence; null when it's fine. */
export function lineProblem(line: LineInput): string | null {
  if (!line.discount) return null;
  const [problem] = validateLineDiscount(line.discount);
  if (problem) return problem;
  if (line.discount.kind === "amount" && line.discount.value > line.unitPrice) return "The discount can't be more than the price.";
  return null;
}

/** The first problem across the lines, naming the line when there are several; null when all are fine. */
export function linesProblem(lines: LineInput[]): string | null {
  for (const [i, line] of lines.entries()) {
    const problem = lineProblem(line);
    if (problem) return lines.length > 1 ? `Line ${i + 1}: ${problem}` : problem;
  }
  return null;
}
