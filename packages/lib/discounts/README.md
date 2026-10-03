# Discounts module

Percent or fixed-amount discounts on catalog prices, for **all products** or **chosen products**,
running from a start to an optional end. Managed by the boss in **Marketing → Discounts**; other
managers can view them.

## How a price is decided

One rule, in the database (`discount_offer()` in
`supabase/migrations/20261001170000_discounts.sql`), so every screen agrees:

- A discount applies to a product if it covers it (all products, or the product is on its list)
  and it was **running at the moment that matters**: `starts_at ≤ moment < ends_at`.
  - Showroom and order form: **now**.
  - Anything priced from an order (amount to pay, estimates, pro forma, invoice draft lines):
    **when the order was placed**. An order keeps the discount it was placed under.
- When several apply, the **lowest price wins**. Discounts never stack.
- Percent: `round(list × (100 − value) / 100)`. Amount: `list − value`. Never below 0, whole units.

The result arrives as an `offer` (`{ discountId, name, kind, value, listPrice, price }`) on what's
already being read, via PostgREST computed fields:

| Read | Field | Used by |
| --- | --- | --- |
| `products` | `offer:product_offer` | showroom, order form (`fetchProductCatalog`) |
| `product_variants` | `offer:variant_offer` | same, for a chosen size |
| `order_items` | `offer:item_offer` | `packages/lib/orders/pricing.ts` → amount to pay, estimates, pro forma, invoice drafts, wallet |

`catalogUnitPrice()` in `packages/lib/orders/pricing.ts` returns the offer's price when there is one, so the
existing pricing rules picked it up without other changes.

## Discounts on invoices and in Accounts

When invoice lines are first priced, `invoice_set_lines()` keeps each line's **list price**
(`order_items.list_unit_price`) and the **discount it was placed under** (`order_items.discount_id`).
A line's discount is `max(list − agreed price, 0) × qty`, so a price staff negotiate below list
counts as a discount too. Invoices show **Subtotal / Discount / Total** and cross out the list price
on discounted lines. Accounts (`accounting_sale_documents.discount`) reports the same sum.

## Once started, it can't be edited

Orders already placed rely on it, so a trigger refuses any change to a discount that has started
except **ending it early** (now, or earlier than planned). Its product list is fixed too. To
change a running discount, **end it and create a new one**. A **scheduled** discount that hasn't
started can be cancelled (deleted). A new discount and its products are created together by
`discount_create()`, in one transaction.

## Layout

This module is the reference example of the module standard (packages/lib/README.md).

```
packages/lib/discounts/
  core/            Pure: records (Offer, Discount), status, business rules, badge text.
    schema.ts      zod: is the input well-formed (types, choices, uuids, dates)?
  ports.ts         DiscountStore: what a host app must provide, tenant-scoped. DiscountError.
  service.ts       class DiscountService: list / create / stop (end now, or cancel if scheduled).
  service.test.ts  The service against an in-memory store.
  adapters/factory/store.ts   This app's store: the discounts tables + discount_create().
  policy.ts        canManageDiscounts (boss), canViewDiscounts (managers).
  actions.ts       "use server": listDiscounts, createDiscount, stopDiscount (session → zod → service).
packages/ui/discounts/DiscountsPanel.tsx    Marketing → Discounts.
```

## Multi-tenant

`discounts` has `tenant_id` (default `default_tenant_id()`) and every query is scoped. Products
don't have a tenant yet, so `discount_offer()` matches discounts of the default tenant; when
products get `tenant_id`, compare with the product's tenant there (see packages/lib/tenancy/README.md).

## Testing

- `npm test`: status, input checks, input schema, price arithmetic (matches the SQL), offer
  parsing, badges, and the service (list order, create, stop) against an in-memory store.
- Run against a throwaway Postgres with every migration applied:
  - **Offers**: overlapping discounts (lowest price wins), variant prices, and orders placed
    before, during and after a discount each getting the right offer.
  - **Invoices**: invoice lines keep their list price when the catalog changes, and Accounts sees the discount.
  - **Editing rules**: running discounts refuse edits, extension and deletion but can be ended. Scheduled ones can be edited and cancelled.
  - **Creation**: products are set atomically with a new discount.
  - **Access**: `anon` can read prices but not the discounts table.
  - **App code**: the TypeScript service, store, showroom query, item pricing, invoice draft/pro forma and other-tenant isolation all ran against it.
