# Team module

The people a business gives work to: second shooters, editors, assistants. For studios it's
**My Business → Team**. **No logins yet**: a member is a name, role and phone to assign tasks to.
Logins for team members come later, when studios need them. Generic and tenant-scoped.

- **Add, edit, archive and restore.** Archived members aren't offered for new tasks but keep
  their history, and a task already with them can stay with them.
- **A member's page** shows their open tasks. The team list shows each member's open count.

## Studio separation

The same rules as every studio module:
- The tenant comes from the caller's studio, and every query filters by it.
- `tenant_id` has no default; row-level security with no policies; no grants to the public roles.
- The adapter names every column it writes.
- `team_members (tenant_id, id)` is the key tasks point at, so the database refuses a task for
  another studio's member.

## Layout

```
packages/lib/team/
  core/            TeamMember, TeamMemberInput, zod schema (phone stored in one form).
  ports.ts         TeamStore, TeamError.
  service.ts       class TeamService: list (active first), active, get, create, update, setArchived.
  service.test.ts
  adapters/supabase/store.ts, server.ts, actions.ts
packages/ui/team/  TeamList, TeamForms (member form, archive button).
supabase/migrations/20261003170000_team_tasks.sql (with tasks)
```

## Testing

- `npm test`: input (phone forms), active first and archived not offered, and studio separation.
- Against Postgres: see packages/lib/tasks/README.md.
