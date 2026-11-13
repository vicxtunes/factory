import "server-only";

import { z } from "zod";

import { canApproveAnnouncements, canManageAnnouncement, canViewAnnouncements } from "@repo/lib/announcements/access";
import { createAnnouncement, decideAnnouncement, deleteAnnouncement, setAnnouncementActive, updateAnnouncement } from "@repo/lib/announcements/actions";
import { fetchAnnouncements } from "@repo/lib/queries";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { deleteSupportReport, getSupportReports, setSupportReportStatus, submitSupportReport } from "@repo/lib/support/actions";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";
import type { Access } from "@repo/lib/staff-access/core";
import type { Announcement, AuditActorType, SupportReport } from "@repo/lib/types";

import { changeTool, outcome, readTool, type ChangeTool } from "../toolbox";
import type { AssistantTool } from "../../server/tools";

// Announcements and support tickets in the staff app (2026-11-10): the boss
// asked Alexis to stop an announcement and resolve two tickets, and it could
// only point at the page. Each change runs the page's own server action, which
// checks again who may do it, and only once the person taps Confirm.

/** The signed-in staff member, as the announcement rules see them. */
export interface StaffViewer {
  userId: string;
  isBoss: boolean;
  access: Access;
  email: string | null;
}

const AUDIENCE = ["dashboard_user", "worker", "designer", "client"] as const satisfies readonly AuditActorType[];
const AUDIENCE_WORDS: Record<(typeof AUDIENCE)[number], string> = { dashboard_user: "dashboard staff", worker: "factory workers", designer: "graphics designers", client: "clients" };
const audienceWords = (a: readonly string[]) => (a.length ? a.map((x) => AUDIENCE_WORDS[x as (typeof AUDIENCE)[number]] ?? x).join(", ") : "everyone");
const shown = (a: Pick<Announcement, "active" | "approval_status">) =>
  a.approval_status === "pending" ? "waiting for the boss's approval" : a.approval_status === "rejected" ? "not approved" : a.active ? "running" : "stopped";
const snippet = (text: string, n = 80) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

async function announcement(id: string): Promise<Announcement> {
  const { data } = await createAdminClient()
    .from("announcements")
    .select("id, title, body, audience, active, created_by_id, created_by_name, created_at, approval_status, approved_at, decided_by_name")
    .eq("id", id)
    .maybeSingle<Announcement>();
  if (!data) throw new Error("That announcement doesn't exist. Look them up again with announcements.");
  return data;
}

/** Throws the sentence Alexis passes on when this person may not change it. */
function mustOwn(viewer: StaffViewer, a: Announcement): void {
  if (!canManageAnnouncement(viewer, a)) throw new Error(`Only ${a.created_by_name ?? "the person who created it"} can change "${a.title}": nobody changes anyone else's announcement, the boss included.`);
}

const audienceInput = z.array(z.enum(AUDIENCE)).describe("Who sees it: dashboard_user (staff), worker, designer, client. Empty: everyone.");

function announcementTools(viewer: StaffViewer): { read: AssistantTool[]; change: ChangeTool[] } {
  if (!canViewAnnouncements(viewer)) return { read: [], change: [] };
  const boss = canApproveAnnouncements(viewer);
  const read = [
    readTool({
      name: "announcements",
      description:
        "Every announcement (the pop-up messages staff, workers, designers or clients see once), newest first: id, title, message, who sees it, whether it's running, stopped, waiting for the boss's approval or not approved, who made it, and whether this person may change it (only its creator can edit, stop, start or delete it).",
      inputSchema: z.object({}),
      run: async () =>
        (await fetchAnnouncements()).map((a) => ({
          id: a.id,
          title: a.title,
          message: a.body,
          audience: audienceWords(a.audience),
          state: shown(a),
          createdBy: a.created_by_name,
          createdAt: a.created_at.slice(0, 10),
          canChange: canManageAnnouncement(viewer, a),
        })),
    }),
  ];
  const change: ChangeTool[] = [
    changeTool({
      name: "create_announcement",
      description: `Make a new announcement: a pop-up shown once to the people chosen. ${boss ? "The boss's own go live straight away." : "It waits for the boss's approval before anyone sees it."}`,
      inputSchema: z.object({ title: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(2000), audience: audienceInput }),
      card: async (a) => ({ title: `New announcement: ${a.title}`, lines: [snippet(a.message, 200), `Shown to: ${audienceWords(a.audience)}`, boss ? "Goes live at once" : "Waits for the boss's approval"] }),
      run: async (a) => outcome(await createAnnouncement({ title: a.title, body: a.message, audience: [...a.audience] }), boss ? `"${a.title}" is live.` : `"${a.title}" is waiting for the boss's approval.`),
    }),
    changeTool({
      name: "edit_announcement",
      description: `Change one of this person's own announcements: title, message and who sees it (give all three, keeping what doesn't change).${boss ? "" : " Editing sends it back to the boss for approval."}`,
      inputSchema: z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(2000), audience: audienceInput }),
      card: async (e) => {
        const a = await announcement(e.id);
        mustOwn(viewer, a);
        return {
          title: `Edit announcement: ${e.title}`,
          lines: [
            ...(e.title !== a.title ? [`Title was: ${a.title}`] : []),
            ...(e.message !== a.body ? [`Message: ${snippet(e.message, 200)}`] : []),
            `Shown to: ${audienceWords(e.audience)}`,
            ...(boss ? [] : ["Goes back to the boss for approval"]),
          ],
        };
      },
      run: async (e) => outcome(await updateAnnouncement(e.id, { title: e.title, body: e.message, audience: [...e.audience] }), `"${e.title}" is saved.`),
    }),
    changeTool({
      name: "stop_or_start_announcement",
      description: "Stop a running announcement (nobody new sees it) or start a stopped one again. Only its creator can.",
      inputSchema: z.object({ id: z.string().uuid(), running: z.boolean().describe("false: stop it; true: start it again.") }),
      card: async ({ id, running }) => {
        const a = await announcement(id);
        mustOwn(viewer, a);
        if (a.active === running) throw new Error(`"${a.title}" is already ${running ? "running" : "stopped"}.`);
        return { title: `${running ? "Start" : "Stop"} announcement: ${a.title}`, lines: [snippet(a.body), `Shown to: ${audienceWords(a.audience)}`, `Now: ${shown(a)}`] };
      },
      run: async ({ id, running }) => outcome(await setAnnouncementActive(id, running), running ? "The announcement is running again." : "The announcement is stopped: nobody new will see it."),
    }),
    changeTool({
      name: "delete_announcement",
      description: "Delete one of this person's own announcements for good. Stopping it is usually enough; delete only when they ask to delete.",
      inputSchema: z.object({ id: z.string().uuid() }),
      card: async ({ id }) => {
        const a = await announcement(id);
        mustOwn(viewer, a);
        return { title: `Delete announcement: ${a.title}`, lines: [snippet(a.body), `Now: ${shown(a)}`, "This can't be undone"] };
      },
      run: async ({ id }) => outcome(await deleteAnnouncement(id), "The announcement is deleted."),
    }),
  ];
  if (boss) {
    change.push(
      changeTool({
        name: "approve_announcement",
        description: "Approve (it goes live) or reject an announcement someone else made that's waiting for the boss. Its creator is told.",
        inputSchema: z.object({ id: z.string().uuid(), approve: z.boolean() }),
        card: async ({ id, approve }) => {
          const a = await announcement(id);
          if (a.approval_status !== "pending") throw new Error(`"${a.title}" isn't waiting for approval: it's ${shown(a)}.`);
          return { title: `${approve ? "Approve" : "Reject"} announcement: ${a.title}`, lines: [snippet(a.body, 200), `By: ${a.created_by_name ?? "unknown"}`, `Shown to: ${audienceWords(a.audience)}`] };
        },
        run: async ({ id, approve }) => outcome(await decideAnnouncement(id, approve), approve ? "It's approved and live." : "It's rejected; its creator is told."),
      }),
    );
  }
  return { read, change };
}

async function report(id: string): Promise<SupportReport> {
  const { data } = await createAdminClient().from("support_reports").select("*").eq("id", id).maybeSingle<SupportReport>();
  if (!data) throw new Error("That support ticket doesn't exist. Look them up again with support_tickets.");
  return data;
}

function supportTools(viewer: StaffViewer): { read: AssistantTool[]; change: ChangeTool[] } {
  const change: ChangeTool[] = [
    changeTool({
      name: "report_problem",
      description: "Send a support ticket to the app's developer: something wrong or missing in the apps, in the person's words. They get a private chat about it.",
      inputSchema: z.object({ message: z.string().trim().min(1).max(4000) }),
      card: async ({ message }) => ({ title: "Send a support ticket", lines: [snippet(message, 300)] }),
      run: async ({ message }) => outcome(await submitSupportReport(message), "The ticket is sent to the developer."),
    }),
  ];
  // Only the developer sees and settles everyone's tickets (packages/lib/support/actions.ts).
  if (viewer.email !== SUPPORT_OWNER_EMAIL) return { read: [], change };
  change.push(
    changeTool({
      name: "set_ticket_status",
      description: "Mark one support ticket resolved, or open it again. The person who raised it is told when it's resolved. One card per ticket.",
      inputSchema: z.object({ id: z.string().uuid(), resolved: z.boolean() }),
      card: async ({ id, resolved }) => {
        const r = await report(id);
        if ((r.status === "resolved") === resolved) throw new Error(`That ticket is already ${r.status}.`);
        return { title: `${resolved ? "Resolve" : "Reopen"} ticket from ${r.author_name}`, lines: [`${r.created_at.slice(0, 10)}: ${snippet(r.body, 200)}`, ...(resolved ? [`${r.author_name} is told it's resolved`] : [])] };
      },
      run: async ({ id, resolved }) => outcome(await setSupportReportStatus(id, resolved), resolved ? "The ticket is resolved." : "The ticket is open again."),
    }),
    changeTool({
      name: "delete_ticket",
      description: "Delete a support ticket and its chat for good, e.g. a duplicate. Only when they ask to delete; otherwise resolve it.",
      inputSchema: z.object({ id: z.string().uuid() }),
      card: async ({ id }) => {
        const r = await report(id);
        return { title: `Delete ticket from ${r.author_name}`, lines: [`${r.created_at.slice(0, 10)}: ${snippet(r.body, 200)}`, `Status: ${r.status}`, "Its chat goes too. This can't be undone"] };
      },
      run: async ({ id }) => outcome(await deleteSupportReport(id), "The ticket is deleted."),
    }),
  );
  return {
    read: [
      readTool({
        name: "support_tickets",
        description: "Every support ticket (problems and requests people sent about the apps), newest first: id, who sent it, when, the message and whether it's open or resolved.",
        inputSchema: z.object({ status: z.enum(["all", "open", "resolved"]).nullable() }),
        run: async ({ status }) =>
          (await getSupportReports())
            .filter((r) => !status || status === "all" || r.status === status)
            .map((r) => ({ id: r.id, from: r.author_name, role: r.author_role, sent: r.created_at.slice(0, 10), message: r.body, status: r.status, resolvedOn: r.resolved_at?.slice(0, 10) ?? null })),
      }),
    ],
    change,
  };
}

/** Announcements and support tickets, for whoever the pages let use them. */
export function staffAdminTools(viewer: StaffViewer): { read: AssistantTool[]; change: ChangeTool[] } {
  const a = announcementTools(viewer);
  const s = supportTools(viewer);
  return { read: [...a.read, ...s.read], change: [...a.change, ...s.change] };
}
