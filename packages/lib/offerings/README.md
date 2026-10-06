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

## Screens

| Screen | Who | What |
| --- | --- | --- |
| `/studio/offerings` (client app) | Studio owner | Services with their packages; Archived tab; Add a service |
| `/studio/offerings/new` | Studio owner | Add a service |
| `/studio/offerings/<service id>` | Studio owner | Edit or archive it; its packages (add, edit, archive, put back); its photos and preview video |
| `/dashboard/studios/<id>` (factory app) | Boss | The studio's services and packages, read-only |
| `/<studio>` (client app, public) | Anyone | The studio's services as showroom cards (cover photo), linking to their pages |
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
  core/              Pure: Service, Offering (a package) records, naming rules, zod schemas. Tests: npm test.
  ports.ts           OfferingStore (tenant-scoped), OfferingError.
  service.ts         class OfferingService: services (catalog, create, update, archive) and their
                     packages (create, update, archive, onSale for the pickers), unique names.
  service.test.ts    The service against an in-memory store, studio separation included.
  adapters/supabase/store.ts   The offering_services and offerings tables.
  server.ts          The wired service.
  actions.ts         createService, updateService, setServiceArchived, createOffering,
                     updateOffering, setOfferingArchived (studio → zod → service).
packages/ui/offerings/  ServicesList, ServiceForm (+ archive), PackagesEditor.
packages/ui/photos/ServiceMediaPanel.tsx  The service's photos and preview video.
apps/client/app/studio/offerings/
supabase/migrations/20261003120000_offerings.sql
supabase/migrations/20261006100000_offering_services.sql   services; every earlier offering
                     became a package of a service with the same name
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
