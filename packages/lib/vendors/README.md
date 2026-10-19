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

## Their Drive

`/vendors/drive`: the files module in the vendor's own workspace (a `tenants` row with no owner,
so never a business), made the first time they open it (`vendor_workspace()`).

## Jobs: studios hiring vendors

On a project, a studio's **Vendors** panel finds vendors (name, what they do) and sends a
request: what's needed, by when, for how much (`core/jobs.ts`, `jobs.ts`).

- **requested → accepted / declined** by the vendor; **accepted → delivered** by the vendor;
  **requested / accepted → cancelled** by the studio; **delivered → paid** by the studio. Each
  move only happens from the state it expects, so two people can't both move a job.
- **Files:** from accepting until it's paid, the vendor reaches the project's folder as a
  contributor (download, upload, add folders), on the job's page (`Via` `job`).
- **Money:** the studio pays from its **Business card** (the Money area or the owner). In one
  transaction (`vendor_job_pay()`) the studio's card gives the price, the vendor's card (their
  workspace's) gets it, and Aming's 10% comes off as a `fee` row. A job is paid once.
- Each side is told in the app: the vendor of a request, a cancellation and a payment; the studio
  owner of an answer and a delivery.
