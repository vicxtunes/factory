import "server-only";

// The weekly summary of what each client owes: a push, and an email when
// there's one on file. Best-effort per client: one that fails is logged and
// the rest still go out. invoice_reminders keeps it to once a day per client,
// so a second run (a retried cron call) sends nothing.

import { localDate } from "@repo/lib/accounting/core/period";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { notifyActor } from "@repo/lib/push/send";
import { resendMailer } from "@repo/lib/studio-access/adapters/resend/mailer";
import { LOGO_CID } from "@repo/lib/studio-access/core/emails";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import { weeklyReminder } from "../reminder";
import * as directory from "./directory";
import * as repo from "./repository";
import { unpaid } from "./service";

export async function sendWeeklySummaries(): Promise<{ clients: number; reminded: number }> {
  const scope = await resolveTenantScope();
  const today = localDate(new Date(), scope.timeZone);
  const payUrl = clientUrl("/payment");

  const byClient = new Map<string, Awaited<ReturnType<typeof unpaid>>>();
  for (const row of await unpaid(null)) {
    if (!row.clientId) continue;
    byClient.set(row.clientId, [...(byClient.get(row.clientId) ?? []), row]);
  }
  const contacts = await directory.loadClientContacts([...byClient.keys()]);

  let reminded = 0;
  for (const [clientId, invoices] of byClient) {
    const contact = contacts[clientId];
    if (!contact) continue;
    try {
      if (!(await repo.claimReminder(clientId, today))) continue;
      const reminder = weeklyReminder(contact.name, invoices, today, payUrl, `cid:${LOGO_CID}`);
      await notifyActor({ type: "client", id: clientId }, { ...reminder.push, url: payUrl });
      if (contact.email) await resendMailer.send({ to: contact.email, ...reminder.email });
      reminded += 1;
    } catch (err) {
      console.error("invoice reminder failed for client", clientId, err);
    }
  }
  return { clients: byClient.size, reminded };
}
