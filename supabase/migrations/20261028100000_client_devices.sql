-- A browser that remembers a client's account (apps/client/app/remembered-device.ts)
-- can unlock it without the password once set up in Manage profile: with a
-- pattern (kept as a scrypt hash) or with the device's own fingerprint or face
-- (a passkey: its WebAuthn credential id and public key). One row per device,
-- made the first time one of them is set up. The lock screen can always fall
-- back to the password.
--
-- RLS on, no policies: service role only.

create table client_devices (
  id uuid primary key,
  client_id uuid not null references clients (id) on delete cascade,
  pattern_hash text,
  passkey_id text unique,
  passkey_public_key text,
  passkey_counter bigint not null default 0,
  passkey_transports text[],
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index client_devices_client_id_idx on client_devices (client_id);

alter table client_devices enable row level security;
