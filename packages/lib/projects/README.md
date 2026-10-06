# Projects module

The work a business does for a customer, usually started from a confirmed booking and moved
through a pipeline to delivery. For studios it's **My Business → Projects**. Generic and
tenant-scoped, so a future product (vendors, service providers) reuses it.

- **Pipeline:** Booked → In progress → Editing → Review → Delivered → Completed
  (`core/rules.ts`).
  - Forward any number of steps, so a quick job can skip review.
  - Back one step, so a client asking for changes sends Review back to Editing.
  - **Completed is final**, and details can change until then.
- **Start project** on a confirmed (or completed) booking copies its client, title and day,
  and links the booking. There's one project per booking: a second tap, or two at once, opens the
  same one. Projects can also be created directly. A booked project's client can't change.
- **Activity history:** every start and every move is kept in `project_events` with who did it
  and when. It's written **in the same transaction** as the change (`projects_create()`,
  `projects_set_status()`), so the history can't miss or invent a move. A move happens only if
  the project is still at the stage the service saw.
- **A project's page brings it together:** client, stage, its booking (day, time, place), the
  money (the invoice from the booking's quotation: paid, left, status), notes and history.
- **Who acted:** today the studio owner (team members get no logins yet). The history stores the
  name as it was, ready for team members later.

## Screens

| Screen | Who | What |
| --- | --- | --- |
| `/studio/projects` | Studio owner | In hand, and one tab per stage |
| `/studio/projects/new`, `/studio/projects/<id>/edit` | Studio owner | Client, title, event day, notes |
| `/studio/projects/<id>` | Studio owner | Pipeline, move on / back / complete, booking, money, notes, history |
| `/studio/bookings/<id>` | Studio owner | Start project (confirmed or completed), or view it |
| `/studio` (dashboard), `/studio/clients/<id>` | Studio owner | Projects in hand; a client's projects |
| `/dashboard/studios/<id>` (factory app) | Boss | The studio's projects by stage, read-only |

## Studio separation

The same rules as bookings:
- The tenant comes from the caller's studio, never the browser, and every query filters by it.
- **Composite foreign keys** make the database refuse another studio's client or booking. This
  migration adds `bookings (tenant_id, id)`.
- `tenant_id` has no default; row-level security with no policies; no grants to the public roles.
- The two functions are executable by the service role only.

## Layout

```
packages/lib/projects/
  core/
    model.ts       Project, ProjectEvent, ProjectInput, the pipeline and its labels.
    rules.ts       canMoveProject, nextStep, previousStep, isActive, canEditProject.
    schema.ts      zod: project input, status.
    core.test.ts
  ports.ts         ProjectStore, ProjectDirectory (customers, bookings), ProjectError.
  service.ts       class ProjectService: list, active, get (+ history), idForBooking,
                   startFromBooking, create, update, setStatus.
  service.test.ts  In-memory adapters, studio separation included.
  adapters/supabase/store.ts, directory.ts
  server.ts, actions.ts   startProjectFromBooking, createProject, updateProject, setProjectStatus.
packages/ui/projects/  ProjectsBoard, ProjectControls (status buttons, start button, form),
                       ProjectBits (badge, pipeline steps, list, history).
supabase/migrations/20261003160000_projects.sql
```

## Testing

- `npm test`:
  - Pipeline moves: forward and skips, one step back, completed final.
  - Next / previous steps, and input rules.
  - The service: start from a confirmed booking once with its history, every move logged
    (revisions included), direct projects need an active client, a booked project's client is
    fixed, active-by-stage ordering, and studio separation.
- Against Postgres through PostgREST:
  - Two simultaneous starts give one project; the booking's details are copied.
  - Moves and their history are written together, and stale moves are refused.
  - Direct projects and updates.
  - Studio B can't see, move, start or change anything, and **the database refuses A's client
    and booking**.
  - `anon` / `authenticated` are denied on the tables and functions.
