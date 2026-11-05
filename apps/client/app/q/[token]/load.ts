import { cache } from "react";

import { shareTokenSchema } from "@repo/lib/billing/core";
import { quotations } from "@repo/lib/billing/server";

/** The quotation behind a link, read once per request (for the layout's head and the page). */
export const load = cache(async (token: string) => {
  const parsed = shareTokenSchema.safeParse(token);
  return parsed.success ? quotations.byLink(parsed.data) : null;
});
