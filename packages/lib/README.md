# Modules (`@repo/lib`)

The system's business logic, one folder per module, shared by both apps (`apps/factory`,
`apps/client`). Each module is a self-contained **plugin**: it owns its rules, declares what it
needs from outside as interfaces (**ports**), and reaches the database only through **adapters**.
So any module can be tested on its own, and reused by another product (photography studios,
vendors and service providers) by plugging in different adapters.

## The module standard

New modules follow this layout. Existing modules move to it when they are next changed.
`discounts/` is the reference example.

```
packages/lib/<module>/
  core/              Pure domain: records, business rules, zod schemas. No framework, database
                     or app imports (eslint.config.mjs fails the build otherwise).
    schema.ts        zod: is the input well-formed? (types, choices, ids, lengths, dates)
    *.test.ts        Unit tests for the rules and schemas.
  ports.ts           Interfaces the module needs (a store, another module's capability), and its
                     error class (`class XError extends AppError {}`).
  service.ts         class XService { constructor(ports) }: the use cases. Takes a TenantScope and
                     an actor, checks the business rules, calls the ports. No database code.
  service.test.ts    The service against in-memory fakes of its ports.
  policy.ts          Who can do what, from the caller's role. Pure.
  adapters/<host>/   The only code that touches the database (or any outside service).
  actions.ts         "use server": the browser's only way in (see "Security").
  README.md          What it does, for whom, its rules, layout and permissions.
packages/ui/<module>/  Screens. They use the service's view models, never database rows.
```

### Rules between modules

- A module never imports another module's internals. It needs another module through a port
  (e.g. invoices needs "something billable"), and the host wires a concrete adapter in.
- `core/` may import only other cores, `@repo/lib/kernel/core` and `@repo/lib/tenancy/types`.
- Pages and actions resolve the tenant once (`resolveTenantScope()`) and pass the `TenantScope`
  down. Nothing inside a module looks it up (see `tenancy/README.md`).
- Build what the current task needs. Add a port, option or helper when a real caller needs it.

## Security

Every action follows the same steps, in this order:

1. **Who is asking**: read the session on the server. Never trust an id or role sent by the browser.
2. **May they**: check `policy.ts`. Refuse with the module's error class.
3. **Is the input well-formed**: `parseInput(schema, input)` (zod). Actions take `unknown`, since
   the browser can send anything.
4. **Does the business allow it**: the service checks the rules in `core/`.
5. **Run it inside `runAction(module, work)`**: expected failures (`AppError`) reach the person
   with their message. Anything else is logged on the server, and the person gets a generic
   message, so internals never leak.

Also:

- Every query filters by `scope.tenantId`, and new tables get row-level security.
  - Aming's own tables: `tenant_id uuid not null default default_tenant_id() references tenants`.
  - Tables a studio owns (customers, …): `tenant_id uuid not null references tenants`, **no
    default**, so code that forgets the studio fails instead of filing data under Aming.
- The service-role client (`supabase/admin.ts`) is used only inside `adapters/`.
- Adapters name every column they write (`toColumns(input)`), never `insert(input)` or
  `update(input)` with the object they were given, so a stray field (a `tenant_id`, an owner)
  can never reach the table, even if a caller skipped the zod schema.
- Public links (invoices, quotations) use unguessable tokens that staff can reset.

## Testing

`npm test` bundles and runs every `*.test.ts` under `packages/lib` with Node's test runner.
No database is needed: cores are pure, and services run against in-memory fakes of their ports.

## The kernel

`kernel/` is what every module shares, kept deliberately small:

| Export | From | What |
| --- | --- | --- |
| `Result<T>` | `kernel/core` | What actions return: `{ ok: true, data }` or `{ ok: false, error }`. |
| `AppError` | `kernel/core` | A failure the person should see. Modules subclass it. |
| `parseInput(schema, input)` | `kernel/core` | zod parse, or an `AppError` listing what's wrong. |
| `runAction(module, work)` | `kernel/server/action` | Runs an action's work and turns the outcome into a `Result`. |
| `optionalText`, `optionalEmail`, `optionalPhone` | `kernel/core` | Form fields: trimmed, empty → null; phones stored in one form. |
| `parsePhone(input)` | `kernel/core` | Validates a phone number and gives the form to store. |
