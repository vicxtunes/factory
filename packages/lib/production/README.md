# Production module

What production uses and costs, what the business owes, and what each product really earns.
Staff app, boss and supervisors only (`canManageProduction`, the same people as Accounts).

Screens:

- **Production → Overview** `/dashboard/production`: for a period, gross profit, production cost, margin
  and materials used (each against the period before), how the cost is known, products by profit (Excel/PDF),
  wastage by material and materials used.
- **Production → Materials** `/dashboard/production/materials`: stock, price per unit and value; Add material,
  Record purchase, Stock count; one material's purchases (void with a reason) and stock history.
- **Production → Product costs** `/dashboard/production/products`: each product size's cost, price, profit and
  margin; one product's recipe.
- **Production → Record usage** `/dashboard/production/usage`: the latest records, each corrected when it used
  something different from its recipe; items made in the last 30 days with nothing recorded (no recipe, or made
  before automatic recording), recorded by hand.
- **Accounts → Money we owe** `/dashboard/accounts/owed`: lenders, loans and repayments; the **We owe** card on
  Accounts → Overview.

## The rules

- **Stock** is the sum of a material's movements (`material_movements`: purchase +, usage −, stock count ±,
  reversal), never a column that could drift. It may go below zero (usage recorded before its purchase); shown in red.
- **A purchase** adds stock, sets the material's price (the latest purchase's), and is a **materials expense**
  (`expenses`, the first kind of money going out). **On credit**, the supplier becomes a lender and the purchase a
  loan from them, received as materials.
- **A recipe** is per product: lines for every size plus each size's own. A material line is per unit or per a
  number detail of the order (`per_attribute_id`, e.g. Pages: qty × the item's pages); an other cost is a fixed
  amount. Labour isn't costed (decided 2026-11-02).
- **Recording usage is automatic** (chosen 2026-11-02): when an item reaches Quality check (or later, from
  before), a trigger records it from its recipe as if it went exactly to plan (`production_auto_record`, the same
  sums as `usagePlan` in `core/costing.ts`) and its stock comes off. It never blocks the status change: a failure
  is a database warning. Nothing is recorded for a product with no recipe. A supervisor **corrects** a record when
  the item used something different (`production_correct_record`: the old one voided, a new one with the same
  expected quantities, in one transaction); only corrections show as wastage, so wastage nobody reports stays
  invisible. When recording by hand, what an item should have used comes from its recipe on the server
  (`createUsage` in `service.ts`); the browser only sends what was actually used. Costs are at the materials'
  prices when it's saved.
- **Profit** (`core/overview.ts`): sales as Accounts counts them (live orders, on the invoice's issue date, at the
  order's agreed total, shared over its lines by their confirmed prices); an item's cost is its record's actual cost,
  else its recipe's estimate at today's prices, else unknown (no recipe), and the overview says how much of each.
- **Borrowed money** is never income and paying it back is never a cost. Only interest is: each repayment's
  interest share is pro rata (amount × extra ÷ total to repay), the last one takes what's left, and it's written to
  `expenses` (`production_record_repayment`; `interestShare` in `core/loans.ts` shows it before saving).
- **History is never edited.** Ledgers are append-only; purchases, expenses, records, loans and repayments are voided
  with a reason, which undoes what they did, and stay in the history (`production_void_only()`).

## Layout

```
packages/lib/production/
  core/          Pure: model, rules (labels, unit prices), schema (zod inputs), costing (recipes, unit costs,
                 margins, expected usage), loans (owed, overdue, interest shares), overview (period figures,
                 wastage). Tests beside them.
  ports.ts       ProductionStore: what a host must provide; every method takes a TenantScope.
  adapters/factory/store.ts   The only database code: the production tables, views and functions.
  service.ts     Money we owe, recording usage, the overview (store + core, no database code). service.test.ts.
  catalog.ts     The live catalog as costing needs it (fetchProductCatalog).
  actions.ts     "use server": the browser's only entry point.
  policy.ts / access.ts / server.ts
packages/ui/production/        The screens.
supabase/migrations/20261130100000_production_costing.sql
```
