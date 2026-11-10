import "server-only";

import { z } from "zod";

import { localDate } from "@repo/lib/accounting/core/period";
import { invoiceFromQuotation, recordPayment, voidInvoice } from "@repo/lib/billing/actions";
import { invoices, quotations } from "@repo/lib/billing/server";
import { confirmBookingRequest, declineBookingRequest } from "@repo/lib/booking-requests/actions";
import { createBooking, deleteBooking, setBookingStatus, updateBooking } from "@repo/lib/bookings/actions";
import { bookings } from "@repo/lib/bookings/server";
import { setCustomerArchived, updateCustomer } from "@repo/lib/customers/actions";
import { customers } from "@repo/lib/customers/server";
import { createProject, setProjectStatus, startProjectFromBooking } from "@repo/lib/projects/actions";
import { projects } from "@repo/lib/projects/server";
import { createTask, setTaskStatus } from "@repo/lib/tasks/actions";
import { tasks } from "@repo/lib/tasks/server";
import { team } from "@repo/lib/team/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { changeTool, outcome, readTool, type ChangeTool } from "../toolbox";
import type { AssistantTool } from "../../server/tools";

// A studio's own work through Alexis (2026-11-10): bookings and online
// requests, projects and tasks, clients, quotations and invoices. Each card
// runs the studio page's own server action, which checks again that the
// person may use that part of the studio.

type Area = "bookings" | "projects" | "clients" | "money";

const money = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD.");
const time = z.string().regex(/^\d{2}:\d{2}$/, "A time as HH:MM.");
const id = z.string().uuid();

export function studioBusinessTools(scope: TenantScope, can: (area: Area) => boolean): { read: AssistantTool[]; change: ChangeTool[]; words: string[] } {
  const read: AssistantTool[] = [];
  const change: ChangeTool[] = [];
  const words: string[] = [];
  const today = () => localDate(new Date(), scope.timeZone);
  const booking = async (bookingId: string) => {
    const b = (await bookings.get(scope, bookingId))?.booking;
    if (!b) throw new Error("That booking doesn't exist. Look it up again with studio_bookings.");
    return b;
  };
  const when = (b: { date: string; startTime: string | null; endTime: string | null }) => `${b.date}${b.startTime ? `, ${b.startTime}–${b.endTime}` : ", all day"}`;

  if (can("bookings")) {
    read.push(
      readTool({
        name: "studio_bookings",
        description: "The studio's bookings between two days (default: today and the next 60 days), earliest first: id, client, title, day and times, place, package, amount, status (tentative, confirmed, completed, cancelled) and whether a client asked for it online (source online: a request waiting while tentative).",
        inputSchema: z.object({ from: day.nullable(), to: day.nullable() }),
        run: async ({ from, to }) => {
          const start = from ?? today();
          const end = to ?? new Date(Date.parse(`${start}T00:00:00Z`) + 60 * 86400000).toISOString().slice(0, 10);
          return (await bookings.between(scope, start, end)).map((b) => ({ id: b.id, client: b.customerName, customerId: b.customerId, title: b.title, date: b.date, start: b.startTime, end: b.endTime, location: b.location, package: b.packageName, amount: b.amount, status: b.status, source: b.source, notes: b.notes }));
        },
      }),
    );
    const details = {
      title: z.string().trim().min(1).max(120),
      date: day,
      startTime: time.nullable().describe("Null with endTime null: all day."),
      endTime: time.nullable(),
      location: z.string().max(200).nullable(),
      packageName: z.string().max(200).nullable(),
      amount: z.number().int().min(0).nullable().describe("UGX"),
      notes: z.string().max(2000).nullable(),
    };
    change.push(
      changeTool({
        name: "create_booking",
        description: "Book a client (customerId from studio_clients) for a day, with times or all day. Clashing bookings are warned about on the card, not refused.",
        inputSchema: z.object({ customerId: id, ...details }),
        card: async (b) => {
          const c = await customers.get(scope, b.customerId);
          if (!c) throw new Error("That client doesn't exist. Look them up with studio_clients.");
          const clashes = await bookings.clashesWith(scope, b, null);
          return { title: `Book ${c.name}: ${b.title}`, lines: [when(b), ...(b.location ? [b.location] : []), ...(b.packageName ? [`Package: ${b.packageName}`] : []), ...(b.amount != null ? [money(b.amount)] : []), ...clashes.map((x) => `Clashes with ${x.title} (${x.customerName})`)] };
        },
        run: async (b) => {
          const res = await createBooking({ ...b, quotationId: null });
          return res.ok ? { ok: true, done: "The booking is made." } : res;
        },
      }),
      changeTool({
        name: "edit_booking",
        description: "Change a booking's details (give only what changes): day, times, place, package, amount, notes, title. Its quotation and invoice follow the new day and times.",
        inputSchema: z.object({ bookingId: id, title: details.title.nullable(), date: day.nullable(), startTime: time.nullable().optional(), endTime: time.nullable().optional(), location: details.location.optional(), packageName: details.packageName.optional(), amount: details.amount.optional(), notes: details.notes.optional() }),
        card: async (e) => {
          const b = await booking(e.bookingId);
          const next = { date: e.date ?? b.date, startTime: e.startTime === undefined ? b.startTime : e.startTime, endTime: e.endTime === undefined ? b.endTime : e.endTime };
          const lines = [
            ...(e.title && e.title !== b.title ? [`Title: ${e.title}`] : []),
            ...(when(next) !== when(b) ? [`When: ${when(b)} → ${when(next)}`] : []),
            ...(e.location !== undefined && e.location !== b.location ? [`Place: ${e.location ?? "none"}`] : []),
            ...(e.packageName !== undefined && e.packageName !== b.packageName ? [`Package: ${e.packageName ?? "none"}`] : []),
            ...(e.amount !== undefined && e.amount !== b.amount ? [`Amount: ${e.amount == null ? "none" : money(e.amount)}`] : []),
            ...(e.notes !== undefined && e.notes !== b.notes ? ["New notes"] : []),
          ];
          if (!lines.length) throw new Error("Nothing changes: say what should be different.");
          const clashes = (await bookings.clashesWith(scope, next, b.id)).map((x) => `Clashes with ${x.title} (${x.customerName})`);
          return { title: `Change booking: ${b.title}, ${b.customerName}`, lines: [...lines, ...clashes] };
        },
        run: async (e) => {
          const b = await booking(e.bookingId);
          const pick = <T>(v: T | undefined, was: T) => (v === undefined ? was : v);
          return outcome(
            await updateBooking(b.id, {
              customerId: b.customerId,
              title: e.title ?? b.title,
              date: e.date ?? b.date,
              startTime: pick(e.startTime, b.startTime),
              endTime: pick(e.endTime, b.endTime),
              location: pick(e.location, b.location),
              packageName: pick(e.packageName, b.packageName),
              amount: pick(e.amount, b.amount),
              notes: pick(e.notes, b.notes),
              quotationId: b.quotationId,
            }),
            "The booking is changed.",
          );
        },
      }),
      changeTool({
        name: "set_booking_status",
        description: "Confirm, complete, cancel or reopen (tentative) a booking the studio made. For a client's online request, use answer_booking_request.",
        inputSchema: z.object({ bookingId: id, status: z.enum(["tentative", "confirmed", "completed", "cancelled"]) }),
        card: async ({ bookingId, status }) => {
          const b = await booking(bookingId);
          if (b.status === status) throw new Error(`That booking is already ${status}.`);
          return { title: `${b.title}, ${b.customerName}: ${status}`, lines: [when(b), `Now: ${b.status}`] };
        },
        run: async ({ bookingId, status }) => outcome(await setBookingStatus(bookingId, status), `The booking is ${status}.`),
      }),
      changeTool({
        name: "answer_booking_request",
        description: "Accept a client's online booking request (it's confirmed, with its invoice and a project) or decline it.",
        inputSchema: z.object({ bookingId: id, accept: z.boolean() }),
        card: async ({ bookingId, accept }) => {
          const b = await booking(bookingId);
          if (b.source !== "online" || b.status !== "tentative") throw new Error("That booking isn't a request waiting for an answer.");
          return { title: `${accept ? "Accept" : "Decline"} ${b.customerName}'s request: ${b.title}`, lines: [when(b), ...(b.packageName ? [`Package: ${b.packageName}`] : []), ...(accept ? ["Makes its invoice and a project", "The client is told"] : ["The client is told"])] };
        },
        run: async ({ bookingId, accept }) => {
          if (!accept) return outcome(await declineBookingRequest(bookingId), "The request is declined.");
          const res = await confirmBookingRequest(bookingId);
          return res.ok ? { ok: true, done: "The booking is confirmed, with its invoice and project." } : res;
        },
      }),
      changeTool({
        name: "delete_booking",
        description: "Delete a booking for good (its project, quotation and invoice stay). Only when asked to delete; otherwise cancel it.",
        inputSchema: z.object({ bookingId: id }),
        card: async ({ bookingId }) => {
          const b = await booking(bookingId);
          return { title: `Delete booking: ${b.title}, ${b.customerName}`, lines: [when(b), "This can't be undone"] };
        },
        run: async ({ bookingId }) => outcome(await deleteBooking(bookingId), "The booking is deleted."),
      }),
    );
    words.push("see, make, change, confirm, cancel or delete bookings and answer online booking requests");
  }

  if (can("projects")) {
    read.push(
      readTool({
        name: "studio_projects",
        description: "The studio's projects (the work after a shoot): id, client, title, event day, stage (upcoming, in_progress, done), the booking it came from.",
        inputSchema: z.object({}),
        run: async () => (await projects.list(scope)).map((p) => ({ id: p.id, client: p.customerName, customerId: p.customerId, title: p.title, eventDate: p.eventDate, stage: p.status, bookingId: p.bookingId })),
      }),
      readTool({
        name: "studio_tasks",
        description: "The studio's tasks not done yet and those done in the last two weeks, most urgent first: id, project, title, who has it (team member or the client), due day, priority, status. Also the team members with their ids.",
        inputSchema: z.object({}),
        run: async () => {
          const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
          const [board, members] = await Promise.all([tasks.board(scope, since), team.list(scope)]);
          return {
            tasks: board.map((t) => ({ id: t.id, project: t.projectTitle, projectId: t.projectId, title: t.title, assignee: t.assigneeName ?? t.customerName, due: t.dueOn, priority: t.priority, status: t.status })),
            team: members.filter((m) => !m.archivedAt).map((m) => ({ id: m.id, name: m.name, role: m.role })),
          };
        },
      }),
    );
    change.push(
      changeTool({
        name: "create_project",
        description: "Start a project: from a booking (bookingId), or on its own for a client (customerId from studio_clients, title, event day).",
        inputSchema: z.object({ bookingId: id.nullable(), customerId: id.nullable(), title: z.string().trim().max(120).nullable(), eventDate: day.nullable(), notes: z.string().max(4000).nullable() }),
        card: async (p) => {
          if (p.bookingId) {
            const b = await booking(p.bookingId);
            return { title: `Start a project from ${b.title}`, lines: [`Client: ${b.customerName}`, when(b)] };
          }
          if (!p.customerId || !p.title) throw new Error("Give the client and a title, or the booking it comes from.");
          const c = await customers.get(scope, p.customerId);
          if (!c) throw new Error("That client doesn't exist.");
          return { title: `New project for ${c.name}: ${p.title}`, lines: [...(p.eventDate ? [`Event: ${p.eventDate}`] : [])] };
        },
        run: async (p) => {
          const res = p.bookingId ? await startProjectFromBooking(p.bookingId) : await createProject({ customerId: p.customerId, title: p.title, eventDate: p.eventDate, notes: p.notes, photosUrl: null });
          return res.ok ? { ok: true, done: "The project is started." } : res;
        },
      }),
      changeTool({
        name: "set_project_stage",
        description: "Move a project to upcoming, in_progress or done.",
        inputSchema: z.object({ projectId: id, stage: z.enum(["upcoming", "in_progress", "done"]) }),
        card: async ({ projectId, stage }) => {
          const p = (await projects.get(scope, projectId))?.project;
          if (!p) throw new Error("That project doesn't exist.");
          if (p.status === stage) throw new Error(`That project is already ${stage.replace("_", " ")}.`);
          return { title: `${p.title}, ${p.customerName}: ${stage.replace("_", " ")}`, lines: [`Now: ${p.status.replace("_", " ")}`] };
        },
        run: async ({ projectId, stage }) => outcome(await setProjectStatus(projectId, stage), "The project has moved."),
      }),
      changeTool({
        name: "create_task",
        description: "Add a to-do to a project (projectId from studio_projects), for a team member (assigneeId from studio_tasks' team) or nobody yet, with an optional due day and a priority.",
        inputSchema: z.object({ projectId: id, title: z.string().trim().min(1).max(200), assigneeId: id.nullable(), dueOn: day.nullable(), priority: z.enum(["low", "normal", "high"]) }),
        card: async (t) => {
          const p = (await projects.get(scope, t.projectId))?.project;
          if (!p) throw new Error("That project doesn't exist.");
          const who = t.assigneeId ? (await team.list(scope)).find((m) => m.id === t.assigneeId)?.name : null;
          if (t.assigneeId && !who) throw new Error("That team member doesn't exist.");
          return { title: `Task for ${p.title}: ${t.title}`, lines: [`For: ${who ?? "nobody yet"}`, ...(t.dueOn ? [`Due: ${t.dueOn}`] : []), `Priority: ${t.priority}`] };
        },
        run: async (t) => {
          const res = await createTask({ ...t, customerId: null, kind: "todo", folderId: null, pickMin: null, pickMax: null });
          return res.ok ? { ok: true, done: "The task is added." } : res;
        },
      }),
      changeTool({
        name: "set_task_status",
        description: "Mark a task pending, in_progress or done (id from studio_tasks).",
        inputSchema: z.object({ taskId: id, status: z.enum(["pending", "in_progress", "done"]) }),
        card: async ({ taskId, status }) => {
          const t = await tasks.get(scope, taskId);
          if (!t) throw new Error("That task doesn't exist.");
          return { title: `${t.title}: ${status.replace("_", " ")}`, lines: [`Project: ${t.projectTitle}`, `Now: ${t.status.replace("_", " ")}`] };
        },
        run: async ({ taskId, status }) => outcome(await setTaskStatus(taskId, status), "The task is updated."),
      }),
    );
    words.push("see and start projects, move them on, add tasks and mark them done");
  }

  if (can("clients")) {
    change.push(
      changeTool({
        name: "edit_studio_client",
        description: "Change a studio client's name, phone, email or notes (give only what changes), or archive them (archived true) or bring them back. Client id from studio_clients.",
        inputSchema: z.object({ customerId: id, name: z.string().trim().min(1).max(120).nullable(), phone: z.string().max(30).nullable(), email: z.string().max(120).nullable(), notes: z.string().max(2000).nullable(), archived: z.boolean().nullable() }),
        card: async (e) => {
          const c = await customers.get(scope, e.customerId);
          if (!c) throw new Error("That client doesn't exist.");
          const lines = [
            ...(e.name && e.name !== c.name ? [`Name: ${c.name} → ${e.name}`] : []),
            ...(e.phone != null && e.phone !== c.phone ? [`Phone: ${c.phone ?? "none"} → ${e.phone || "none"}`] : []),
            ...(e.email != null && e.email !== c.email ? [`Email: ${c.email ?? "none"} → ${e.email || "none"}`] : []),
            ...(e.notes != null && e.notes !== c.notes ? ["New notes"] : []),
            ...(e.archived != null && e.archived !== !!c.archivedAt ? [e.archived ? "Archive them" : "Bring them back"] : []),
          ];
          if (!lines.length) throw new Error("Nothing changes: say what should be different.");
          return { title: `Edit client ${c.name}`, lines };
        },
        run: async (e) => {
          const c = await customers.get(scope, e.customerId);
          if (!c) return { ok: false, error: "That client is gone." };
          if (e.name || e.phone != null || e.email != null || e.notes != null) {
            const res = await updateCustomer(c.id, { name: e.name ?? c.name, phone: e.phone ?? c.phone ?? "", email: e.email ?? c.email ?? "", notes: e.notes ?? c.notes ?? "" });
            if (!res.ok) return res;
            if ("duplicateOf" in res.data) return { ok: false, error: `${res.data.duplicateOf.name} already has that phone number.` };
          }
          if (e.archived != null && e.archived !== !!c.archivedAt) {
            const res = await setCustomerArchived(c.id, e.archived);
            if (!res.ok) return res;
          }
          return { ok: true, done: "The client is updated." };
        },
      }),
    );
    words.push("change or archive clients");
  }

  if (can("money")) {
    read.push(
      readTool({
        name: "studio_documents",
        description: "The studio's quotations (id, number, client, issued, valid until, status, total) and invoices (id, number, client, issued, due, status, total, paid, balance), newest first, in UGX.",
        inputSchema: z.object({ search: z.string().max(60).nullable() }),
        run: async ({ search }) => {
          const q = search?.toLowerCase() ?? "";
          const match = (d: { number: string; billTo: { name: string } }) => !q || d.number.toLowerCase().includes(q) || d.billTo.name.toLowerCase().includes(q);
          const [qs, is] = await Promise.all([quotations.list(scope), invoices.list(scope)]);
          return {
            quotations: qs.filter(match).slice(0, 50).map((d) => ({ id: d.id, number: d.number, client: d.billTo.name, issued: d.issuedAt.slice(0, 10), validUntil: d.validUntil, status: d.status, total: d.total })),
            invoices: is.filter(match).slice(0, 50).map((d) => ({ id: d.id, number: d.number, client: d.billTo.name, issued: d.issuedAt.slice(0, 10), due: d.dueDate, status: d.status, total: d.total, paid: d.paid, balance: d.balance })),
          };
        },
      }),
    );
    const invoice = async (invoiceId: string) => {
      const d = (await invoices.list(scope)).find((x) => x.id === invoiceId);
      if (!d) throw new Error("That invoice doesn't exist. Look it up with studio_documents.");
      return d;
    };
    change.push(
      changeTool({
        name: "record_studio_payment",
        description: "Record money a client paid on one of the studio's invoices outside the app (cash, mobile money, bank, card).",
        inputSchema: z.object({ invoiceId: id, amount: z.number().int().positive(), method: z.enum(["cash", "mobile_money", "bank_transfer", "card", "other"]), receivedOn: day, reference: z.string().max(100).nullable(), note: z.string().max(500).nullable() }),
        card: async (p) => {
          const d = await invoice(p.invoiceId);
          return { title: `Record ${money(p.amount)} on invoice ${d.number}`, lines: [`Client: ${d.billTo.name}`, `${p.method.replace("_", " ")}, received ${p.receivedOn}`, `Balance before: ${money(d.balance)}, after: ${money(Math.max(d.balance - p.amount, 0))}`] };
        },
        run: async (p) => {
          const res = await recordPayment(p.invoiceId, { amount: p.amount, method: p.method, receivedOn: p.receivedOn, reference: p.reference, note: p.note });
          return res.ok ? { ok: true, done: "The payment is recorded." } : res;
        },
      }),
      changeTool({
        name: "invoice_from_quotation",
        description: "Make the invoice for an accepted quotation (or get the one already made).",
        inputSchema: z.object({ quotationId: id }),
        card: async ({ quotationId }) => {
          const d = (await quotations.list(scope)).find((x) => x.id === quotationId);
          if (!d) throw new Error("That quotation doesn't exist.");
          return { title: `Invoice from quotation ${d.number}`, lines: [`Client: ${d.billTo.name}`, money(d.total)] };
        },
        run: async ({ quotationId }) => {
          const res = await invoiceFromQuotation(quotationId);
          return res.ok ? { ok: true, done: "The invoice is made." } : res;
        },
      }),
      changeTool({
        name: "void_studio_invoice",
        description: "Void one of the studio's invoices, with the reason (its booking is cancelled).",
        inputSchema: z.object({ invoiceId: id, reason: z.string().trim().min(3).max(500) }),
        card: async ({ invoiceId, reason }) => {
          const d = await invoice(invoiceId);
          return { title: `Void invoice ${d.number}`, lines: [`Client: ${d.billTo.name}`, money(d.total), `Reason: ${reason}`, "Its booking is cancelled"] };
        },
        run: async ({ invoiceId, reason }) => outcome(await voidInvoice(invoiceId, reason), "The invoice is void."),
      }),
    );
    words.push("see quotations and invoices, record payments, invoice an accepted quotation, void an invoice");
  }
  return { read, change, words };
}
