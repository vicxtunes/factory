# Agents module

A **sales agent** signs in, places orders for clients of their own, follows them, earns commission
and withdraws it. The boss registers them and answers their withdrawals. Agents never hold money:
clients pay Aming directly.

- **Signing in:** an agent is a client account with an `agents` row (`agents.client_id`), as a vendor
  is. Their side is `/agents` in the client app. There's no public sign-up: the boss registers them,
  and they set a password with "Forgot password".
- **Their clients** (`agent_clients`): one the agent registers is theirs at once. One whose phone or
  email is already on Aming waits for staff (`/dashboard/agents/clients`), and until then the agent
  sees only what they typed. A client has at most one agent. An agent can edit a client's details
  only while that client has no login of their own.
- **Orders:** placed with `buildAndInsertOrder` at list prices, into reception's normal queue. An order staff or a designer create in an agent's name is theirs
  too: it shows in their portal and earns the same way. Commission starts on 2026-11-01: orders
  tagged before then don't earn (`orders.commission_eligible`). It doesn't add the client to the agent's list.
- **Pay before production:** only an order the agent places from their own login (`orders.placed_by_agent`)
  goes to production once a % of its price is paid. The boss sets it for all agents (Rates & settings,
  `agent_settings.pay_first_percent`, 80 at first) and per agent (`agents.pay_first_override`); 0 means no
  payment first. `payFirstPercent()` reads it when checked. When the boss saves a new % (for all agents or one agent) and orders are already waiting under it, they choose: those orders take the new % ("follow"), or keep the one they had, written on the order as `orders.pay_first_percent` ("keep", migration 20261231100000). Every check reads the order's own % first (`orderPayFirst()`). It waits in Client
  Orders, `routeApprovedOrder` refuses to send it on earlier, and the card shows what's paid. The agent (order
  form, order page, "confirmed" push), the client (confirmation message) and the assistant (`get_my_orders`) are
  told. An order staff or a designer create in an agent's name earns the same but flows as any other order:
  released at once, no payment check (owner, 2026-11-06).
- **Older tagged orders:** those from before 2026-11-01 are listed in the portal with "No commission";
  figures count only orders that earn. Those from 1 November up to the 2026-11-04 release were brought
  in later (`supabase/migrations/20261220100000_commission_from_november.sql`): they earn and, with
  `orders.offers_kept`, keep the discounts they were placed under.
- **No company discounts:** the agent already earns commission, so an order that earns takes no
  running discount, promo code or line discount (`item_offer()` and `order_item_set_discount()`,
  `supabase/migrations/20261217100000_no_discounts_on_agent_orders.sql`). The portal and the staff
  order form show list prices for them. Orders with `offers_kept` (above) keep theirs.
- **Stages:** `agentStage()` in `core.ts`. An order shows its least advanced line.

## Commission

Worked out in the database, from triggers on order lines, orders, the wallet ledger and payment
receipts, so no way of paying or delivering can miss it (`agent_commission_evaluate()`,
supabase/migrations/20261216100000_agent_platform.sql). If it fails, the payment still stands: it's
logged and tried again when the agent looks (`settlePending`).

- **Rate:** the agent's own (`agents.rate_override`), else the line's category's (`commission_rates`),
  else 0. Saved per line when placed (`agent_commission_lines`), so changing a rate leaves placed
  orders alone.
- **Amount:** the order's price (`orders.quoted_price`, after discounts) shared across its lines by
  their value, each share at its rate, rounded down to a shilling.
- **Credited** when paid in full and every line is delivered.
- **After that** it follows what's still paid: a part refund takes back that part, a cancellation all
  of it, and the balance can go below zero, which blocks withdrawing until new commission covers it.

## Withdrawals

`packages/lib/wallet/server/agent.ts`, made like a vendor's. The money leaves the balance when asked
for. **Only the boss** answers (`/dashboard/agents/withdrawals`):

- **Mobile money:** approving hands it to HivePay, whose answer settles it. HivePay takes its fee from
  what it sends. The boss's setting says who carries that: `agent`, nothing more happens; `aming`,
  the fee goes back on the balance once HivePay reports it. Sending extra up front isn't possible
  without HivePay's price list, which it doesn't publish. The setting in force when they asked applies.
- **Bank:** the boss sends it by hand and records the reference and account. Any bank charge is a
  normal expense.

Paid withdrawals are money out in the day book (`money_day_lines`).

## Telling agents

`tellAgents()` runs every couple of minutes on the production server
(`apps/client/instrumentation-node.ts`) and compares each order's stage and commission with what the
agent was last told. That way every place an order can change is covered, and a 5-line order sends
one message.

## Checking the database half

`commission-check.sql` runs the money rules against a real database inside a transaction that's
rolled back: paste the migration between `begin;` and it on a test database, never live.
- **Agents' clients (Agents → Clients):** registrations to check, then everyone on an agent's list. The boss
  edits contacts, changes agent, or merges an agent's client into the same person already on Aming
  (`merge_client` in migration 20261230100000): orders, payments, receipts and chats move, the agent's
  phone/email fill blanks, the person stays the agent's, the duplicate is deleted and noted in `client_merges`.
  Refused for a client with a login, an agent/vendor/studio account, wallet money, or another agent's client.
