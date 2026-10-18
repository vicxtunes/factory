# Vendors module

A **vendor** is someone offering their services to photographers and their clients: photo
editors, videographers, photographers, graphic designers and equipment hire first, then event,
beauty and transport vendors (`core/categories.ts`). A vendor is not a business: no studio
set-up, review or workspace. They have their own side of Aming at `/vendors`.

- **Joining** (`/vendors/join`, one question a screen): individual or business, what they do,
  what they offer, contact, social handles, a password, then the emailed code. The account is
  made, then the vendor (`joinAsVendor`). One vendor per account.
- **Their side** (`/vendors`): their name, what they do, their services and handles. Jobs from
  photographers, rates and payments come next. Aming's fee on what their clients pay through
  Aming is `VENDOR_FEE_PERCENT` (10%).
- Stored in `vendors` (supabase/migrations/20261108100000_vendors_apart.sql), server only.
