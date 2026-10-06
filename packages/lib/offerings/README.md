# Offerings module (Packages & Services)

What a business sells, priced in its own currency. In studios it's **Packages & Services**:

- **Services** are what the studio does, e.g. "Wedding Photography" or "Baby Shoot": a name, a
  description, and (photos module) a cover photo, a gallery and a preview video. They're what the
  studio's showroom shows.
- **Packages** are a service's tiers, e.g. "Gold", "Silver", "Bronze", "Custom": each with its own
  price, description and what's included, one short line each ("8 hours coverage", "300 edited
  photos", "1 photobook").

Quotations, invoices and bookings are built from packages. They **copy** a package's name
("Wedding Photography · Gold", see `offeringLabel`), price and inclusions when they use it, so
editing a package never changes a document that's already been sent.

- **Names are unique** among what's on sale, ignoring case: services within a studio, packages
  within their service (so every service can have its own "Gold"). An archived one's name is free
  again; restoring one whose name has been taken is refused until one is renamed.
- **A service's address** (`/<studio>/s/<slug>`) comes from its first name and never changes, so
  shared links survive a rename.
- **Archive, don't delete**: archived services and packages are off sale but kept for what used
  them. Archiving a service takes its packages off sale too, and it takes no new ones.
- **Order**: services and packages show in the order they were added.
- **Prices** are whole units of the studio's currency, never negative (a free package is fine),
  and shown with `formatAmount(scope, …)` (packages/lib/tenancy/format.ts), never a hard-coded UGX.

The module is generic and tenant-scoped, so a future product (vendors, service providers) reuses it.

## Products

A studio keeps **Products** (photobooks, frames, prints) the same way: categories of their own
(`kind: "product"`, apart from the services' categories), each product with its **sizes** as its
packages ("8x12", "12x18"), each size with its price. A product's address is `/<studio>/p/<slug>`.

- **Picked from Aming** (`sourceProductId`): Aming's name, description, photos, preview video and
  sizes are copied in, each size priced 0 ("Price on request") until the studio sets its prices.
  The name and sizes stay Aming's (no rename, no new sizes); the studio sets prices and the
  description, deactivates sizes it doesn't sell, and may leave some of Aming's photos and video out
  (`hiddenMedia`: `"cover"`, `"video"` or a gallery item's id). Once Aming no longer has it on sale,
  it's off the studio's showroom. Each Aming product is picked once.
- **The studio's own**: like a service, with its own photos and video.
- **Selling**: clients ask for one online (packages/lib/product-requests). Quotations and invoices
  pick from services' packages and products' sizes (`onSale(scope)`); bookings from services' only
  (`onSale(scope, "service")`).

## Screens

| Screen | Who | What |
| --- | --- | --- |
| `/studio/offerings` (client app) | Studio owner | Services with their packages; Archived tab; Add a service |
| `/studio/products` (client app) | Studio owner | Products with their sizes; pick from Aming's catalog or add your own; Aming's photos to leave out |
| `/studio/offerings/new` | Studio owner | Add a service and its packages in one form |
| `/studio/offerings/<service id>` | Studio owner | The same form: the service and its packages saved together (a package removed there is archived); archived packages to put back; its photos and preview video |
| `/dashboard/studios/<id>` (factory app) | Boss | The studio's services and packages, read-only |
| `/<studio>` (client app, public) | Anyone | The studio's services as showroom cards (cover photo), linking to their pages |
| `/<studio>/p/<product>` (client app, public) | Anyone | A product's page: its photos (Aming's, less those left out), its sizes, "Order now" |
| `/<studio>/s/<service>` (client app, public) | Anyone | The showroom's item page (`@repo/ui/showroom/Showcase`): photos, preview video, the packages to choose from (a 0 price reads "Price on request"), "Book on WhatsApp" naming the chosen one |

## Studio separation

The same rules as customers (packages/lib/customers/README.md): the tenant comes from the caller's
studio, never the browser; every query filters by it; `tenant_id` has no default; row-level
security with no policies; no grants to `anon` / `authenticated`. A package's service is a
composite key `(tenant_id, service_id)`, so the database refuses a package in another studio's
service. The adapter names every column it writes, so nothing else a caller passes can reach the
tables.

## Photos and video

A service's media is a private photo album of kind `service` (packages/lib/photos): its cover (the
first photo until another is chosen), its gallery, and its preview video (MP4, WebM or MOV, up to
200 MB, uploaded straight to storage like photos). It counts toward the studio's storage allowance
and is never public on its own: it's shown through the service's page.

## Layout

```
packages/lib/offerings/
  core/              Pure: Service, Offering (a package) records, naming rules, zod schemas;
                     aming.ts: a picked product's photos and video. Tests: npm test.
  ports.ts           OfferingStore (tenant-scoped), OfferingError.
  service.ts         class OfferingService: saveService (the form: a service and its packages,
                     checked as a whole), catalog, archive / restore, onSale for the pickers.
  service.test.ts    The service against an in-memory store, studio separation included.
  adapters/supabase/store.ts   The offering_services and offerings tables.
  server.ts          The wired service; amingProducts(), Aming's products on sale.
  actions.ts         saveService, setServiceArchived, setOfferingArchived (studio → zod → service).
packages/ui/offerings/  ServicesList, ServiceForm (the one form; ArchivedPackages; archive button).
packages/ui/photos/ServiceMediaPanel.tsx  The service's photos and preview video.
apps/client/app/studio/offerings/
supabase/migrations/20261003120000_offerings.sql
supabase/migrations/20261006100000_offering_services.sql   services; every earlier offering
                     became a package of a service with the same name
supabase/migrations/20261009110000_studio_products.sql     products: kinds, picked from Aming
```

## Testing

- `npm test`: schemas (whole, non-negative prices; blank inclusion lines dropped; limits; unknown
  fields such as `tenant_id` or a service's `slug` dropped), naming rules, and the service: order,
  addresses unique per studio and kept on rename, names unique per studio / per service ignoring
  case, archive frees a name and restore refuses a clash, an archived service's packages off sale,
  and one studio can't read, change or archive another's.
- The migration, against a copy of the production offerings: every offering became a package of
  its own service with the same id (so quotation lines still point at it), clashing addresses got
  `-2`, `-3`; and the tables refuse a duplicate package name in a service, a package in another
  studio's service, a second album for a service, a public service album, a video on any other
  album, a video or photo over the allowance, and `anon`.
- The real adapters through PostgREST against that database: services and packages created,
  ordered, renamed (address kept), archived and restored; names matched exactly (`%`, `_`
  literal); another studio refused; service albums private and kept out of the portfolio, opened
  twice at once giving the same album; videos counted, replaced, removed, and refused over the
  allowance or for another studio.
