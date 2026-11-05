# Production module

What production uses and costs, what the business owes, and what each product really earns.
Staff app, boss and supervisors only (`canManageProduction`, the same people as Accounts).

Screens:

- **Production → Overview** `/dashboard/production`: for a period, gross profit, production cost, margin
  and materials used (each against the period before), how the cost is known, products by profit (Excel/PDF),
  wastage by material and materials used.
- **Production → Parts** `/dashboard/production/materials`: everything bought or made, tabbed All / Bought / Made.
  A bought part: stock, price per unit and value; Record purchase, Stock count; its purchases (void with a reason)
  and stock history. A made part: what it's made of (its lines, beside an order to try) and what uses it.
- **Production → Product costs** `/dashboard/production/products`: each product size's cost, price, profit and
  margin (per sheet or page when it depends on one); a product's **setup** at `/<id>/setup`.
- **Production → Record usage** `/dashboard/production/usage`: the latest records, each corrected when it used
  something different from its setup; items made in the last 30 days with nothing recorded (not set up, or made
  before automatic recording), recorded by hand.
- **Production → Speed** `/dashboard/production/speed`: from each item's history (order_audit_log) and its
  order's dates: order to ready, on time against the client's date, items late right now, where items wait (each
  stage's middle time), the trend week by week, the slowest products, making time by worker (`core/speed.ts`).
- **A product's page** `/dashboard/production/products/<id>`: its sales, profit, units and margin against the
  period before, a year of sales against cost, units and cost of one by month, its sizes, clients and wastage;
  its setup at `/setup`.
- **Accounts → Money we owe** `/dashboard/accounts/owed`: lenders, loans and repayments; the **We owe** card on
  Accounts → Overview.

## The rules

- **Stock** is the sum of a material's movements (`material_movements`: purchase +, usage −, stock count ±,
  reversal), never a column that could drift. It may go below zero (usage recorded before its purchase); shown in red.
- **A purchase** adds stock, sets the material's price (the latest purchase's), and is a **materials expense**
  (`expenses`, the first kind of money going out). **On credit**, the supplier becomes a lender and the purchase a
  loan from them, received as materials.
- **Parts** (`core/parts.ts`, the `materials` table): a part is **bought** (stock, purchases, a price from the
  latest one) or **made** from other parts (`part_lines.part_of`, any depth, never inside itself; no stock of its
  own, refused by a trigger). A part may be **sold on its own** (`product_id`: its catalog price is its client
  price, everywhere, e.g. a box) and may belong to **one product only** (`owner_product_id`; set when it's added,
  only ever changed to shared). Shared names are unique; a product's own parts only among themselves.
- **A product's setup** is its own lines (`part_lines.product_id`) and how it's priced (`products.pricing`):
  **fixed per size** (the catalog's price) or **built from parts** (the client prices of its parts added up; such a
  product has no catalog price, as the catalog's price wins everywhere downstream). A line is a part × how many,
  optionally × a number on the order (× NOS), for one size, only when the order chose something (Lamination =
  Matt), or **the part the order chose** in a detail (Packaging: a part by its product's name, else its own); or
  an **other cost** (a fixed amount). Order details match by name without a note in brackets ("NOS (Number of
  Sheets)" = "NOS"). A made part's client price is its own, else its parts' added up. A price is never guessed:
  a missing number, or a choice that changes the price with no line for it, leaves the order priced on the call.
  **Copy from** another product copies its pricing and lines (size lines by size name) and makes the parts it
  uses shared. Every save is kept in `part_setup_history`. Labour isn't costed (decided 2026-11-02).
- The classes: `BoughtPart` and `MadePart` (a `Component`: own price, and what a quantity of it adds),
  `PartsCatalog` (all parts; walks lines), `ProductSetup` (lines + a `PricingMethod`: `FixedPerSize`,
  `BuiltFromParts`). A new way of pricing is one more `PricingMethod`.
- **Recording usage is automatic** (chosen 2026-11-02): when an item reaches Quality check (or later, from
  before), a trigger records it from its product's setup, down to the bought parts, as if it went exactly to plan
  (`production_auto_record` → `parts_usage()`, the same walk as `ProductSetup.usage()`) and their stock comes off.
  It never blocks the status change: a failure is a database warning. Nothing is recorded for a product not set up.
  A supervisor **corrects** a record when the item used something different (`production_correct_record`: the old
  one voided, a new one with the same expected quantities, in one transaction); only corrections show as wastage,
  so wastage nobody reports stays invisible. When recording by hand, what an item should have used comes from its
  setup on the server (`createUsage` in `service.ts`); the browser only sends what was actually used. Costs are at
  the parts' prices when it's saved.
- **Order prices** for products built from parts: `partsListPrice` in `pricing.ts`, worked out on the server and
  stored as the line's list price when an order is placed (and when staff change details before it's confirmed).
- **Profit** (`core/overview.ts`): sales as Accounts counts them (live orders, on the invoice's issue date, at the
  order's agreed total, shared over its lines by their confirmed prices); an item's cost is its record's actual cost,
  else its setup's estimate at today's prices, else unknown (not set up), and the overview says how much of each.
- **Borrowed money** is never income and paying it back is never a cost. Only interest is: each repayment's
  interest share is pro rata (amount × extra ÷ total to repay), the last one takes what's left, and it's written to
  `expenses` (`production_record_repayment`; `interestShare` in `core/loans.ts` shows it before saving).
- **History is never edited.** Ledgers are append-only; purchases, expenses, records, loans and repayments are voided
  with a reason, which undoes what they did, and stay in the history (`production_void_only()`).

## Layout

```
packages/lib/production/
  core/          Pure: model, rules (labels, unit prices), schema (zod inputs), parts (parts, setups, pricing),
                 costing (the costs list, margins), loans (owed, overdue, interest shares), overview (period
                 figures, wastage). Tests beside them.
  ports.ts       ProductionStore: what a host must provide; every method takes a TenantScope.
  adapters/factory/store.ts   The only database code: the production tables, views and functions.
  service.ts     Money we owe, recording usage, the overview (store + core, no database code). service.test.ts.
  catalog.ts     The live catalog as costing needs it (fetchProductCatalog).
  pricing.ts     An order line's price from its parts (partsListPrice).
  actions.ts     "use server": the browser's only entry point.
  policy.ts / access.ts / server.ts
packages/ui/production/        The screens.
packages/ui/charts/kit.tsx     The D3 chart kit they use (orange = money in, blue = cost, aqua = time).
supabase/migrations/20261130100000_production_costing.sql
supabase/migrations/20261218090000_clear_materials.sql   The clean start: old materials, usage, recipes and
                                                        sheet prices deleted (refused if any purchase exists)
supabase/migrations/20261218100000_parts.sql   Parts and setups (the old recipe and sheet tables stay, empty and
                                               unused, so a rolled-back app still runs)
```
