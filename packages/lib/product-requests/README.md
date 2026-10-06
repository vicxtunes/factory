# Product requests module

Clients ask a studio for one of its products online, and the studio answers. It works like booking
requests (packages/lib/booking-requests/README.md): no WhatsApp, no password, no PIN.

## The client

1. On a product's page (`/<studio>/p/<product>`), **Order now** (or "Order 8x12 now" when a size is
   picked) opens a few steps: the **size** and **how many** (1–99), their **name and phone**
   (skipped when they're signed in at the studio), a last look, **Send order request**.
2. It goes straight to the studio as a request, **Requested**, and the owner gets a push
   notification. The size's name ("Photobook · 8x12") and price are copied, so later edits never
   change it.
3. **A new client** is added to the studio's clients and this device is signed in to their page for
   good; their page lists **Your orders**.
4. **A number the studio already knows** still orders, but signs nothing in. This device remembers
   the request (a signed cookie, `studio-portal/remembered.ts`) and the showroom shows how it stands.

Limits: the product and size must be on sale (one picked from Aming also on sale at Aming), and a
client can have at most 3 requests waiting at a studio.

## The studio

- **Dashboard → Order requests (n)** lists them until they're answered.
  - **Confirm**: the **invoice** is made (quantity × price, due today; none for a size priced 0, "on
    request") and opens. Safe to tap twice: a request confirmed before only gets what it's missing.
  - **Decline**.

## Layout

```
packages/lib/product-requests/
  core.ts           ProductRequest, orderNowSchema (size, how many, name, phone), MAX_OPEN_PRODUCT_REQUESTS.
  service.ts        class ProductRequestService: request, confirm, decline, over ProductRequestDeps.
  service.test.ts   The orchestration against fakes.
  adapters/supabase/store.ts   The product_requests table.
  server.ts         The service wired to offerings (and Aming's catalog), customers, billing,
                    studio-portal and push; the studio's lists; the device's remembered requests.
  actions.ts        orderNow (public, by the studio's address), confirmProductRequest,
                    declineProductRequest (the owner).
apps/client/app/order-now.tsx                         The Order now steps.
packages/ui/product-requests/ProductRequestsList.tsx  The dashboard's list, Confirm / Decline.
supabase/migrations/20261009100000_studio_products.sql
```

## Testing

- `npm test`: a new client signed in, a known number not; signed-in clients order as themselves;
  refusals (off sale, unknown size, missing details, too many waiting); how many, 1–99; confirm
  makes one invoice and is safe to repeat; no invoice for a 0 price; decline; answered requests
  stay answered.
