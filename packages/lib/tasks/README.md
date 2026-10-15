# Tasks module

Work on a project: what, who (a team member, the project's client, or unassigned), by when, and how urgent. For studios,
tasks live on a project's page, with **My Business → Tasks** for everything still to do. Generic and
tenant-scoped.

- **Add** on a project that's still in hand, for an active team member (or nobody yet).
- **Status:** Pending → In progress → Done, any way round. Done can be reopened, and `done_at` is
  kept while done.
- **Overdue:** not done and past its due day (the studio's calendar). Due today isn't late yet.
- **Order** (`byUrgency`): open before done, soonest due first (no due day last), high priority
  first, then title.
- **Remove** a task outright: unlike money or bookings, nothing refers to it.
- **Where it shows:**
  - a project's tasks on its page;
  - the Tasks page (Open / Overdue / Unassigned, or one person's);
  - each member's open tasks;
  - **Tasks to do** on the studio dashboard;
  - for a team member who signs in without projects, only theirs (dashboard and Tasks page): they
    can start and finish them, and the server refuses a status change on anyone else's;
  - the studio's open tasks and team for the boss, read-only.

## Tasks for clients

- A task can be given to the **project's own client** instead of a team member (never both; never
  another client). It shows on their page (`/<studio>/me`, "For you to do").
- **Kinds:** a to-do; **Choose photos** (a folder, and how many: at least / at most); **Give
  feedback** (a folder); **Name the photos** (a folder: a caption on each, e.g. the children in a
  school's photos). The kind, folder and picks are set when the task is made.
- Choosing and feedback happen in Files, in the task's folder (packages/lib/files/README.md →
  "Choosing"): the client sends their choice or says they're done, which marks the task done and
  tells the owner. Reopening the task lets them change it.
- Giving a task in a folder shares the folder with whoever it's for (packages/lib/files).
- **No sign-in needed:** a client's task with photos (choosing, feedback, naming) has **Copy link
  for the client** on its row: `client.<domain>/<studio>/t/<secret>`, made the first time it's
  copied. Whoever holds it sees only that task's folder (pictures show, nothing downloads) and does
  that task only; it works only at that studio's address and dies with the task.

## Studio separation

- The tenant comes from the caller's studio, and every query filters by it.
- **Composite foreign keys** make the database refuse a task on another studio's project or for
  another studio's team member.
- `tenant_id` has no default; row-level security with no policies; no grants to the public roles.
- The adapter names every column it writes. A task's project never changes.

## Layout

```
packages/lib/tasks/
  core/            Task, TaskInput, labels, isOverdue, byUrgency, zod schemas.
  ports.ts         TaskStore, TaskDirectory (projects, team members), TaskError.
  service.ts       class TaskService: forProject, open (all / one person's), create, update,
                   setStatus, remove.
  service.test.ts
  adapters/supabase/store.ts, directory.ts, server.ts, actions.ts
packages/ui/tasks/  TaskRows (+ AddTaskForm), TasksBoard.
supabase/migrations/20261003170000_team_tasks.sql
```

## Testing

- `npm test`:
  - Overdue (due today isn't late), urgency order, input rules.
  - The service: only on projects in hand, only to active members (a task can stay with a
    since-archived one), done and reopen, and studio separation.
  - Team: see packages/lib/team/README.md.
- Against Postgres through PostgREST (every studio migration applied):
  - **The database refuses another studio's project or member**, including giving A's task to
    B's member.
  - `done_at` must match done.
  - Names come through the composite keys.
  - Done and reopen; archived members refused for new work; removing.
  - Every cross-studio path refused, and `anon` denied.
