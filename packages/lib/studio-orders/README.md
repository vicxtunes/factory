# Studio orders module (the Aming link)

A studio's projects often need Aming's work: prints, a photobook, frames. This module links the
orders a studio's owner places with Aming to the studio's projects, so a project shows its
production progress. **It's how studios bring Aming orders.**

- **Order from Aming** (a project's page) opens the client app's normal order form at
  `/new?project=<id>`. The notes are pre-filled "For project: …" and a banner names the project.
  The order is placed **exactly as any client order** (Client Orders → approval → factory, priced
  and invoiced as today), then linked to the project.
- **Link an existing order:** the owner's recent orders that aren't cancelled or linked yet.
- **Unlink** takes the order off the project. The order itself is untouched.
- **Progress** comes from the same words the client sees in My Orders
  (`packages/lib/orders/clientStatus.ts`). An order is as far along as its slowest item, and it's
  finished when every item is delivered. A cancelled order reads "Cancelled".
- **The boss** sees, on a studio's page, the orders it placed for its projects.

## Changes to Aming's ordering (kept minimal)

- `buildAndInsertOrder` now also returns the new order's id (`orderId`). Staff callers pass it
  through unchanged.
- The client app's `placeOrder` takes an optional `project_id`. After the order is created it
  calls `linkPlacedOrder()`, which **never throws**. If linking fails, the order stands and the
  confirmation shows "…couldn't be linked to the project. Link it from the project's page."

## Who can link what

Orders have no tenant: an order belongs to a studio when **the studio's owner placed it**.
- The studio always comes from the session.
- The owner's orders are chosen by the owner's client id.
- `studio_link_order()` re-checks, in the database, that the order's client is the studio's owner
  and that the project is the studio's own.
- `project_orders.order_id` is unique (one project per order): linking an order to a second
  project is refused, and linking it to the same one again is a no-op.
- `tenant_id` has no default; row-level security with no policies; no grants to the public roles.
  The function is executable by the service role only.

## Layout

```
packages/lib/studio-orders/
  core/            LinkedOrder, OrderChoice, zod schema (order id).
  progress.ts      Aming rows → LinkedOrder: progress words, slowest item, finished, cancelled.
  progress.test.ts
  ports.ts         StudioOrderStore, StudioOrderError.
  service.ts       class StudioOrderService: forProject, forStudio, choices, link, unlink.
  service.test.ts
  adapters/supabase/store.ts   project_orders, orders, order_items, studio_link_order().
  server.ts        The wired service; linkPlacedOrder() for the order form.
  actions.ts       linkOrderToProject, unlinkOrderFromProject.
packages/ui/studio-orders/AmingOrders.tsx   LinkedOrdersList, OrderFromAming.
supabase/migrations/20261003180000_project_orders.sql
```

## Testing

- `npm test`:
  - Progress: the slowest item in the client's words; received once a worker has it; designing
    is the same step as production; finished; cancelled; no items.
  - The service: linking (and again, as a no-op), one project per order, choices, unlink, and a
    studio can't link another owner's order, use another studio's project, or touch its links.
- Against Postgres through PostgREST (every studio migration applied, with stand-in order
  tables):
  - Choices are the owner's own orders: not cancelled, not linked, newest first, with a summary.
  - Progress and items come out as expected.
  - One project per order.
  - Another owner's order and another studio's project are refused by the database function.
  - Studio B sees nothing of A's; unlinking makes an order a choice again.
  - `anon` / `authenticated` are denied.
  - This run caught a real bug before it shipped: an order's link comes back one-to-one (an
    object or null), not a list, because `order_id` is unique.
