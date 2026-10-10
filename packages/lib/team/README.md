# Team module

The people a business gives work to: second shooters, editors, assistants. For studios it's
**My Business → Team**. A member is a name, role and phone to assign tasks to, and can also sign
in with their own Aming account to work in the business. Generic and tenant-scoped.

- **Add, edit, archive and restore.** Archived members aren't offered for new tasks but keep
  their history, and a task already with them can stay with them.
- **A member's page** shows their open tasks. The team list shows each member's open count.

## Signing in (access)

The owner chooses what each member may use, from the member's page:

| Choice | Areas |
| --- | --- |
| Manager | everything below: runs the business for the owner |
| Accounts | clients and money |
| Tasks only | none: only the tasks given to them |
| Choose | any of: bookings, projects (& tasks), clients, money, catalog (packages, products, showroom) |

Never given: the team, the business profile, its brand and document settings, and
Aming orders (placed under the owner's own account). Those stay the owner's.

- **Invite.** "Invite to sign in" makes a link (`/studio/join/<token>`, 7 days; a new one
  replaces the old). The owner copies it or sends it on WhatsApp.
- **Join.** The member opens it, signs in to their own Aming account (or makes one) with the
  code emailed to them, and joins. The owner's own account can't join their own business.
- **Working.** The member opens My Business and sees only what they were given (the menu, the
  dashboard and the pages; actions refuse the rest). Owner and members alike get in
  with their Aming sign-in: there's no second studio login. A member without projects sees only their own
  tasks, and can start and finish them. An account that owns a business and works for others
  chooses which one from "Working in" at the top of the menu.
- **Remove access.** Their sign-in stops at once (and any invite link). They stay on the team
  for tasks. Archiving a member also stops their sign-in.

Each page and action says what it needs (`requireStudio(area)`, `studioOfCaller(area)` in
packages/lib/studios); none means owner-only, so new pages stay the owner's until they say
otherwise. The rule itself is `canUse` in `core/access.ts`.

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
  core/            TeamMember, TeamMemberInput, zod schemas (phone stored in one form);
                   access.ts: areas, presets, canUse.
  ports.ts         TeamStore, TeamAccounts (owner), TeamError.
  service.ts       class TeamService: list (active first), active, get, create, update, setArchived,
                   setAccess, invite, removeAccess, byInvite, join, membershipsOf.
  service.test.ts
  adapters/supabase/store.ts, server.ts, actions.ts
packages/ui/team/  TeamList, TeamForms (member form, archive button), TeamAccess (access, invite link).
apps/client/app/studio/(setup)/join/[token]  the invite link's page.
supabase/migrations/20261003170000_team_tasks.sql (with tasks), 20261013100000_team_access.sql
```

## Testing

- `npm test`: input (phone forms), active first and archived not offered, studio separation,
  access rules and presets, invites and joining (own business, expired, archived,
  replaced links, removed access).
- Against Postgres: see packages/lib/tasks/README.md.
