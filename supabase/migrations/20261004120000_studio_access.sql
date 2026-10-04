-- Studio access (My Business; see packages/lib/studio-access/README.md).
--
-- 1. Onboarding: a new studio confirms its name, owner's names, phone, logo
--    and address, verifies an email with a 6-digit code, sets a password and
--    submits itself for review.
-- 2. Review: the boss approves, sends back with a reason, or suspends. Until
--    a studio is active its workspace is locked, its public page is off and
--    its clients can't sign in.
-- 3. The studio password: asked on each device every 30 days; 5 wrong tries
--    lock it for 15 minutes.
--
-- Existing studios start at onboarding too: they confirm their details and
-- are reviewed like new ones. Aming's own tenant is always active.

alter table tenants
  add column status text not null default 'onboarding'
    check (status in ('onboarding', 'in_review', 'changes_requested', 'active', 'suspended')),
  add column owner_first_name text check (char_length(owner_first_name) between 1 and 50),
  add column owner_last_name  text check (char_length(owner_last_name) between 1 and 50),
  -- The logo's key in the photo bucket (R2).
  add column logo_key text check (char_length(logo_key) <= 200),
  -- The owner's sign-in email: verified with a code, used for password resets.
  add column owner_email text check (char_length(owner_email) <= 120),
  add column owner_email_verified_at timestamptz,
  add column password_hash text,
  -- Changing the password signs every other device out (their unlock carries this).
  add column password_set_at timestamptz,
  add column password_failed_attempts int not null default 0 check (password_failed_attempts >= 0),
  add column password_locked_until timestamptz,
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz,
  -- The boss's reason for sending back or suspending; shown to the studio.
  add column review_note text check (char_length(review_note) <= 500),
  add constraint tenants_password_complete check ((password_hash is null) = (password_set_at is null));

update tenants set status = 'active' where owner_client_id is null;

create index tenants_studio_status on tenants (status, submitted_at) where owner_client_id is not null;

-- One pending email code per studio and purpose. Only an HMAC of the code is
-- stored; it works for 10 minutes and 5 tries.
create table studio_email_codes (
  tenant_id   uuid not null references tenants (id) on delete cascade,
  purpose     text not null check (purpose in ('verify', 'reset')),
  email       text not null check (char_length(email) <= 120),
  code_hash   text not null,
  attempts    int not null default 0 check (attempts >= 0),
  sent_at     timestamptz not null default now(),
  expires_at  timestamptz not null,
  primary key (tenant_id, purpose)
);

-- Server (service role) only.
alter table studio_email_codes enable row level security;
revoke all on table studio_email_codes from anon, authenticated;
