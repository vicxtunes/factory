import { timingSafeEqual } from "node:crypto";

import { sendWeeklySummaries } from "@repo/lib/invoices/reminders";

// The weekly "what you owe" summary, called by Vercel Cron on Monday mornings
// (vercel.json), which sends CRON_SECRET as a bearer token. Without the
// secret set, nobody can call it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await sendWeeklySummaries());
}
