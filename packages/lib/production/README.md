# Production module

What production uses and costs, what the business owes, and what each product really earns.
Staff app, boss and supervisors only (`canManageProduction`, the same people as Accounts).

Screens:

- **Production → Overview** `/dashboard/production`: for a period, gross profit, production cost, margin
  and materials used (each against the period before), how the cost is known, products by profit (Excel/PDF),
  wastage by material and materials used.
- **Production → Materials** `/dashboard/production/materials`: what products are made of, each with its cost and
  (the boss) its selling price; add or edit one in a form sheet.
- **Production → Product costs** `/dashboard/production/products`: each product size's cost from its recipe, price,
  profit and margin; a photo book's cost with no sheets + per sheet, and how it's priced; the photo book margin. A
  product's **recipe** at `/<id>/setup`, with **Try it** (one order worked out, line by line).
- **Production → Speed** `/dashboard/production/speed`: from each item's history (order_audit_log) and its
  order's dates: order to ready, on time against the client's date, items late right now, where items wait (each
  stage's middle time), the trend week by week, the slowest products, making time by worker (`core/speed.ts`).
- **A product's page** `/dashboard/production/products/<id>`: its sales, profit, units and margin against the
  period before, a year of sales against cost, units and cost of one by month, its sizes, clients and wastage;
  its recipe at `/setup`.
- **Accounts → Money we owe** `/dashboard/accounts/owed`: lenders, loans and repayments; the **We owe** card on
  Accounts → Overview.

## The rules

- **Costing** follows the owner's prototype (2026-11-06; `core/recipes.ts`, migration `20261224100000_costing_recipes.sql`).
  It replaced parts, setups and price per sheet. A **material** (`materials`) costs one amount (`unit_cost`), an amount for
  each size (`size_costs`), or is **built** from other materials (`material_parts`: a quantity × the part's cost, or × a cost of one
  typed for each size; a part is never built itself). It may have a **selling price** (`sell_price`, or `size_sells`),
  used only by photo books priced from their materials.
- **A recipe** (`recipe_lines`) is a material × how many. On a photo book it can be **per sheet** (× the order's NOS);
  per sheet belongs to photo books only. A line can be **only for some sizes** and **only when** the order chose
  something (Type = Crystal), and can carry the book's own selling price. Order details match by name without a note
  in brackets ("NOS (Number of Sheets)" = "NOS"). The size is the order's Size detail, else its size variant.
- **Add-ons** are the catalog's Lamination and Packaging products the order names: their catalog price, and the cost
  of their own recipe, **once per book**.
- **Prices:** every product but a photo book has its catalog price. The boss chooses how each photo book is priced
  (`products.auto_price`), and the order then arrives priced:
  - **from the margin**: one margin for all photo books (`costing_settings.margin`, 40% until set) or the book's own
    (`products.margin`), on the whole book with its add-ons. The base is (cost ÷ (1 − margin)) − the add-ons' prices,
    rounded up to the next 500 and never below 0, and the add-ons' prices are added on top.
  - **from its materials**: each line's selling price (the book's own first, else the material's) × how many, + the
    add-ons' catalog prices.
  - **null**: the catalog's price, or priced on the call.

  A price or cost that isn't set counts as 0 (owner, 2026-11-07), so the order still gets a price and Try it lists
  what was counted as 0; only a book with no recipe, or one that comes to 0, is priced on the call. A book priced from its recipe has no catalog price (both
  sides refuse). `recipeListPrice` in `pricing.ts` works the price out on the server, and stores it as the line's list
  price when the order is placed (and when staff change details before it's confirmed). Selling prices and margins
  are the boss's alone; a supervisor's save keeps them.
- **Stock is left out for now** (owner, 2026-11-06): nothing comes off stock automatically, and the purchase and
  stock screens are gone. The tables (`material_purchases`, `material_movements`, `production_records`) and their
  functions stay, so the overview's materials-used and wastage figures read empty until stock comes back.
- **Profit** (`core/overview.ts`): sales as Accounts counts them (live orders, on the invoice's issue date, at the
  order's agreed total, shared over its lines by their confirmed prices); an item's cost is its record's actual cost,
  else its recipe's estimate (with its add-ons) at today's costs, else unknown (no recipe), and the overview says how much of each.
- **Borrowed money** is never income and paying it back is never a cost. Only interest is: each repayment's
  interest share is pro rata (amount × extra ÷ total to repay), the last one takes what's left, and it's written to
  `expenses` (`production_record_repayment`; `interestShare` in `core/loans.ts` shows it before saving).
- **History is never edited.** Ledgers are append-only; purchases, expenses, records, loans and repayments are voided
  with a reason, which undoes what they did, and stay in the history (`production_void_only()`).

## Layout

```
packages/lib/production/
  core/          Pure: model, rules (labels, unit prices), schema (zod inputs), recipes (materials, recipes, photo book prices),
                 costing (the costs list, margins), loans (owed, overdue, interest shares), overview (period
                 figures, wastage). Tests beside them.
  ports.ts       ProductionStore: what a host must provide; every method takes a TenantScope.
  adapters/factory/store.ts   The only database code: the production tables, views and functions.
  service.ts     Money we owe, the overview, speed (store + core, no database code).
  catalog.ts     The live catalog as costing needs it (fetchProductCatalog).
  pricing.ts     A photo book order line's price from its recipe (recipeListPrice).
  actions.ts     "use server": the browser's only entry point.
  policy.ts / access.ts / server.ts
packages/ui/production/        The screens.
packages/ui/charts/kit.tsx     The D3 chart kit they use (orange = money in, blue = cost, aqua = time).
supabase/migrations/20261130100000_production_costing.sql
supabase/migrations/20261218090000_clear_materials.sql   The clean start: old materials, usage, recipes and
                                                        sheet prices deleted (refused if any purchase exists)
supabase/migrations/20261224100000_costing_recipes.sql   Materials, recipes and photo book prices; parts, setups
                                               and price per sheet dropped
```
