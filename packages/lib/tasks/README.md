# Tasks module

Work on a project: what, who (a team member, or unassigned), by when, and how urgent. For studios,
tasks live on a project's page, with **My Studio → Tasks** for everything still to do. Generic and
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
  - the studio's open tasks and team for the boss, read-only.

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
