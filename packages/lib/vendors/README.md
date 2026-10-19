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

`/vendors/drive`: the files module (packages/lib/files) on the vendor's own tables,
`vendor_folders` and `vendor_files` (`vendorDrive`, `adapters/supabase/drive.ts`), within their own
storage allowance (`vendors.storage_quota_bytes`); their files sit under `vendors/<id>/` in the
bucket. Theirs alone: no shares, task picks or comments.

## Jobs: studios hiring vendors

On a project, a studio's **Vendors** panel finds vendors (name, what they do) and sends a
request: what's needed, by when, for how much, **the folder** they work in (one inside the
project's, or a new one made for them: the only folder of the project they see), and maybe
**samples first** (`core/jobs.ts`, `jobs.ts`).

- **requested → samples → samples_sent** (asked for samples) **or awaiting_funds** (not), by the
  vendor accepting; **declined** otherwise. Reviewing the samples, the studio approves them and
  pays in, or cancels: nothing is paid for samples.
- **Paying in:** when the work goes ahead the studio's **Business card** pays the price to
  Aming, which **holds** it (`vendor_job_fund()`): **in_progress**. The Money area or the owner.
- **delivered → paid:** the studio approves; Aming releases the money to the vendor's
  **wallet**, less its 10% (`vendor_job_release()`).
- **Disputes:** over work in progress or delivered, the studio raises one (the vendor can give
  up work in progress instead: the studio is refunded, `vendor_job_refund()`). The boss is told;
  the boss settles it on **Vendor jobs** (`/dashboard/vendor-jobs`): release
  or refund.
- **No answer:** delivered work the studio doesn't approve or dispute is released on its own
  after **2 days**; the boss and the studio are warned after **1**. Checked whenever the
  project, the vendor's home or Vendor jobs opens (`sweepOverdue`), so no schedule is needed.
- Each move only happens from the state it expects, so two people can't both move a job; each
  money move is one transaction and happens once.
- Each side is told in the app at every step.
